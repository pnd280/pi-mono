# Kế hoạch: chờ background task trong `agent_end` và tool `subagent_abort`

Kế hoạch này ghi lại thiết kế ban đầu. Cơ chế giao kết quả và xác nhận hủy hiện tại được mô tả trong [ADR 0001](../packages/extensions/pi-subagents/docs/adr/0001-hold-run-for-background-results.md).

Package: `packages/extensions/pi-subagents` (tên package `pi-subagents`), và adapter trong `packages/extensions/pi-tool-display` (tên package `pi-tool-display`). Pi đã kiểm tra: 1.0.2.

Bối cảnh và các phương án đã loại: [pi-subagents-background-delivery-discussion.md](pi-subagents-background-delivery-discussion.md). Bản tiếng Anh: [pi-subagents-background-wait-plan.en.md](pi-subagents-background-wait-plan.en.md).

Các nhận định về Pi dựa trên việc đọc source Pi 1.0.2. Các rủi ro chính đã được kiểm chứng bằng thử nghiệm; xem [Các rủi ro đã kiểm chứng](#các-rủi-ro-đã-kiểm-chứng).

## Quyết định đã thống nhất

1. Supervisor chờ background task trong `agent_end` ở **mọi mode và mọi depth**: TUI, RPC, print, JSON và subagent.
2. Supervisor chỉ chờ khi assistant message cuối có `stopReason` là `"stop"` hoặc `"toolUse"`, và còn ít nhất một direct background task chưa xong.
3. Supervisor dừng chờ khi xảy ra **một** trong các sự kiện sau:
   - Background task **đầu tiên** xong.
   - Có input mới: `ctx.hasPendingMessages()`, polling khoảng mỗi 250 ms.
   - Có abort qua `ctx.signal`.
4. Sau khi dừng chờ, kết quả được giao bằng follow-up. Ở `agent_end` sau đó, supervisor chờ tiếp nếu còn task.
5. Giữ `agent_before_settle` làm cơ chế dự phòng ở depth > 0 và ở print/JSON, cho trường hợp lỗi hoặc `length` mà Pi không phục hồi. Cơ chế dự phòng cũng chờ task **đầu tiên** (phương án b) và dùng chung hàm chờ.
6. Giữ `wakeIdle()` cho kết quả đến sau abort hoặc sau khi supervisor đã idle.
7. Chấp nhận các hệ quả sau:
   - Sau abort, supervisor settle trong khi task còn chạy.
   - Tối đa N lần gọi model cho N task.
   - `pi-agent-summary` tính cả thời gian chờ.
   - Lệnh `/sesh` bị chặn trong lúc chờ.
8. Thêm tool `subagent_abort`:
   - Chỉ có tham số `task_id`, và chỉ abort task mà supervisor sở hữu.
   - Trả về xác nhận ngay. Không giao thêm kết quả `cancelled` cho model đã gọi abort.
   - Model-only, và ẩn khi supervisor đã đạt `maxDepth`.
   - Lý do hủy là `"Cancelled by supervisor"`.
   - Supervisor trung gian của descendant bị abort vẫn nhận kết quả `cancelled`.
   - Card hiển thị nhất quán với tool `subagent`: có display adapter riêng trong pi-tool-display, và pi-subagents dùng adapter đó cho card của chính nó.
   - Kết quả kẹt lại sau abort được giao qua `agent_settled` + `wakeIdle()`.
   - Trạng thái trên card là `⊘ aborted`. Bản thân call là thành công: không có `isError`, card không hiện trạng thái lỗi.
   - Summary mode có category mới: `aborted {n} subagent(s)`.
   - Adapter không có test tự động, giống adapter `subagent` hiện có.
9. Không tách tool `subagent`, và không thêm quy tắc vào `AGENTS.md`.
10. Test cho cả hai phần đã được duyệt.
11. Thứ tự thực hiện: phần A, rồi phần B, trong cùng một lần thay đổi.

## Phần A: cơ chế chờ

### A1. Hàm chờ chung trong `src/delivery.ts`

Thay `settling` bằng trạng thái chờ chung, và thêm một hàm riêng, ví dụ `next(signal?: AbortSignal)`. Hàm này lặp cho đến khi có một trong các kết quả sau:

| Điều kiện, kiểm tra theo thứ tự            | Kết quả    |
| ------------------------------------------ | ---------- |
| `Delivery` đã đóng                         | `"closed"` |
| `pending` có kết quả                       | `"result"` |
| Không còn direct background task chưa xong | `"none"`   |
| `ctx.hasPendingMessages()` trả về `true`   | `"input"`  |
| `signal?.aborted`                          | `"abort"`  |

Giữa các lần kiểm tra, hàm chờ sự kiện đến trước trong ba sự kiện sau:

- `completed()` báo có thay đổi, qua một promise thông báo nội bộ.
- Hết khoảng polling 250 ms.
- Event `abort` của `signal`.

Hàm phải dọn timer và listener khi kết thúc.

Thay đổi trong `completed()`:

- Trong lúc chờ, chỉ thêm vào `pending` rồi báo cho hàm chờ. Không gửi `sendMessage`.
- Task trong tập "suppressed" (xem B2): đánh dấu `delivered`, không thêm vào `pending`, nhưng vẫn báo cho hàm chờ để nó kiểm tra lại số task còn lại.
- Ngoài lúc chờ: giữ nguyên như hiện nay (follow-up khi đang chạy, `wakeIdle()` khi idle).

Chỉ có một lần chờ tại một thời điểm, vì Pi gọi `agent_end` và `agent_before_settle` lần lượt.

### A2. Handler `agent_end`

Thêm `Delivery.end(event, ctx)`, và đăng ký nó trong `src/index.ts` bằng `pi.on("agent_end", ...)`.

1. Bỏ qua nếu `Delivery` đã đóng.
2. Tìm assistant message cuối trong `event.messages`. Bỏ qua nếu không có message nào, hoặc nếu `stopReason` không phải `"stop"` hay `"toolUse"`.
3. Gọi `next(ctx.signal)`.
4. Xử lý theo kết quả:
   - `"result"`: `take()`, rồi gửi từng message bằng `pi.sendMessage(message, { deliverAs: "followUp", triggerTurn: true })`. Pi sẽ chạy tiếp trước khi settle (`agent-session.js:1384-1386`).
   - `"input"`, `"none"`, `"closed"`: trả về, Pi tự xử lý hàng đợi.
   - `"abort"`: trả về và giữ `pending` lại cho A4.

### A3. Cơ chế dự phòng trong `settle()`

- Giữ điều kiện hiện tại: bỏ qua khi depth 0 mà mode không phải print/JSON.
- Thay `Promise.all` bằng `next()`, không truyền signal, vì `ctx.signal` là `undefined` tại thời điểm này.
- `"result"`: trả về `entries` dạng `custom_message` kèm `continue: true`, như hiện nay.
- Các kết quả khác: trả về `undefined`. Với `"input"`, Pi tự chạy tiếp vì có message trong hàng đợi (`agent-session.js:1427`).
- Giới hạn đã biết, không thay đổi so với hiện nay: abort trong lúc chờ ở đây không làm dừng chờ.

Handler trong `src/index.ts` vẫn giữ `event.entries` của các handler trước.

### A4. Giao kết quả còn lại sau abort

Kết quả có thể đã vào `pending` đúng lúc có abort. Thêm `Delivery.settled(ctx)` và đăng ký trong `pi.on("agent_settled", ...)`: nếu `pending` có kết quả và `ctx.isIdle()` thì giao bằng `wakeIdle()`.

### A5. `src/index.ts`

- Đăng ký `agent_end` và `agent_settled`.
- Không thay đổi `bind()` hay `shutdown()`. `Delivery.shutdown()` phải giải phóng lần chờ đang diễn ra: báo cho hàm chờ, và hàm trả về `"closed"`.

## Phần B: tool `subagent_abort`

### B1. Schema và tool

- Thêm `abortInputSchema` vào `src/tool-schema.ts`: `z.strictObject({ task_id: z.string().min(1).describe(...) })`.
- Thêm `createAbortTool(tasks, delivery)`, trong file mới `src/abort-tool.ts` hoặc trong `src/tool.ts`. Chọn chỗ theo `docs/agents/architecture.md`.
  - `name: "subagent_abort"`, `executionMode: "parallel"`.
  - Mô tả ngắn: chỉ abort khi kết quả của task không còn cần; session vẫn resume được bằng `task_id`.
- Đăng ký trong `bind()`, cùng điều kiện và exposure với tool `subagent` (`src/index.ts:130-131`).
- Đăng ký renderer cho `subagent_abort` giống tool `subagent` (`src/index.ts:51`, `src/render.ts`): `createToolDisplayRenderers("subagent_abort", subagentAbortDisplayAdapter)`, bọc trong cùng `MouseRegion` để click mở task. Tổng quát hoá `createRenderers()` để nhận adapter và tên tool, thay vì sao chép code.

### B2. Thực thi

1. Gọi `tasks.owned(task_id)` để kiểm tra quyền sở hữu. Nếu task là direct live task (`tasks.active(task_id)`), gọi `delivery.suppress(task)` **trước** khi abort.
2. Gọi `tasks.abort(task_id)`. Hàm này đã xử lý cả direct task và descendant (`src/tasks.ts:797-808`).
   - Lý do hủy hiện được ghi cứng là `"Cancelled by user"`. Thêm tham số `reason` cho `Tasks.abort()`, và dùng `"Cancelled by supervisor"` cho tool này.
3. Trả về kết quả cùng dạng với tool `subagent`, để adapter và model đọc giống nhau:
   - `details`: `ToolDetails` của task sau khi abort, gồm `task_id`, `binding_id`, `description`, `model`, `thinking`, `background`, `state: "cancelled"`, `started_at`, `ended_at`, `usage`. Với direct task, lấy từ `task.details`. Với descendant, dựng từ `TaskRecord` mà `tasks.abort()` trả về.
   - `content`: task envelope (`formatTaskEnvelope`) với `state: "cancelled"` và nội dung ngắn: task đã bị abort, có thể resume bằng `task_id`.
   - **Không** đặt `isError`, vì việc abort đã thành công. Không dùng `taskResult()` nguyên dạng, vì hàm đó đặt `isError` cho trạng thái `cancelled`.
4. Lỗi giữ nguyên thông báo hiện có: `"Task does not belong to this session"`, `"Task is inactive"`.

Descendant bị abort sẽ hoàn thành ở supervisor sở hữu nó. Supervisor đó nhận kết quả `cancelled` như bình thường, vì model của nó không gọi abort.

Lệnh `/subagents abort` của người dùng giữ nguyên hành vi: kết quả `cancelled` vẫn được giao cho model.

### B3. Tương tác với cơ chế chờ

Khi task cuối cùng bị abort, `completed()` báo cho hàm chờ, và hàm trả về `"none"` mà không có kết quả nào. Nhờ vậy supervisor dừng chờ và không có thêm lần gọi model nào.

### B4. Display adapter trong pi-tool-display

Theo `packages/extensions/pi-tool-display/docs/adapters.md`, mục Add an adapter.

- `src/adapters/pi-subagents/index.ts`:
  - Thêm `subagentAbortDisplayAdapter`, id `"pi-subagents:subagent_abort"`, family `"invocation"`.
  - `supports`: args là `{ task_id: string }` (strict), và `details` khớp với `detailsSchema` hiện có của adapter.
  - `progress`: label `"Subagent"`, description của task, identity `model:thinking`, field `task_id`. Status dùng glyph cancelled với chữ `"aborted"`. Secondary hiển thị usage, như card cancelled hiện nay. Trước khi có details, description là `task_id`.
  - `action`: mở task bằng `pi-subagents:open`, giống tool `subagent`.
  - `outcome`: không trả về `"cancelled"` cho bản thân call, vì call đã thành công.
  - `textParts`: bỏ task envelope như adapter `subagent`.
  - Summary: category mới `subagent-aborts`, `"aborted {n} subagent"` / `"aborted {n} subagents"`, identity là `task_id`.
  - Mở rộng `piSubagentAdapter`: cùng kiểm tra provenance, nhưng với `tool.name === "subagent_abort"` thì kiểm tra parameter schema `{ task_id: string }` bắt buộc rồi trả về adapter mới.
  - Dùng chung các hàm `usage`, `fields` hiện có; không sao chép.
- `src/adapters/recorded.ts`: thêm contract `"pi-subagents:subagent_abort"`. Không đổi `ADAPTER_CONTRACT_VERSION`, vì đây là contract mới, không đổi contract cũ.
- `src/adapters/index.ts`: export `subagentAbortDisplayAdapter`, để pi-subagents import qua `pi-tool-display/adapters`.
- `src/host/selection.ts`: không đổi, vì `piSubagentAdapter` đã có trong danh sách resolver.
- Adapter `subagent` hiện có không có test tự động; README của nó dùng kiểm tra thủ công. Adapter mới theo cùng cách. Không thêm test tự động cho adapter.

## Phần C: tài liệu

- `README.md`, mục Usage:
  - Supervisor ở mọi mode vẫn bận trong khi còn background task. Input mới hoặc abort làm nó dừng chờ.
  - Kết quả được giao theo từng lần có task xong.
  - Thêm `subagent_abort`.
  - Ghi chú rằng `pi-agent-summary` tính cả thời gian chờ, và lệnh cần idle bị chặn.
- `docs/testing.md`: cập nhật S1, S4, S5 cho cơ chế chờ mới, và thêm các mục test ở phần D.
- `docs/pi-compatibility.md`, mục Background and viewer contracts, thêm các hợp đồng sau:
  - Pi await handler `agent_end` trước khi xử lý sau lượt chạy.
  - `ctx.signal` còn hoạt động trong `agent_end`.
  - `event.messages` có `stopReason`.
  - Follow-up gửi trong `agent_end` được chạy trước khi settle.
  - `hasPendingMessages()` chỉ đếm input qua `prompt()`, không đếm `sendMessage()`.
  - Cập nhật dòng nói rằng child chờ trong `agent_before_settle`.
- `packages/extensions/pi-tool-display/src/adapters/pi-subagents/README.md`: mô tả contract, card và summary của `subagent_abort`.
- `src/guidance.ts`: không đổi. Nếu cần nhắc model về `subagent_abort`, đặt nội dung đó trong mô tả của tool mới.

## Phần D: test (đã duyệt)

Thêm vào `validation/background.test.ts` và `validation/input.test.ts`. Thêm scenario mới vào `validation/provider.ts` khi cần.

1. Task đầu tiên xong thì dừng chờ, trong khi task chậm hơn vẫn chạy. Mỗi kết quả được giao đúng một lần, ở top-level RPC và ở print/JSON.
2. Abort trong lúc chờ làm dừng chờ mà không hủy background task. Kết quả đến sau vẫn được giao qua `wakeIdle()`.
3. Input mới (follow-up hoặc steer) gửi vào supervisor đang chờ được xử lý mà không phải chờ task xong.
4. Lỗi mà không retry: ở subagent và print/JSON, `settle()` vẫn chờ và giao kết quả.
5. Retry và compaction không bị chặn: một lượt chạy lỗi có thể retry thì không chờ.
6. `subagent_abort`:
   - Dừng task và giải phóng capacity.
   - Session vẫn resume được.
   - Từ chối task không thuộc quyền sở hữu, và task đã kết thúc.
   - Không giao thêm kết quả `cancelled`.
   - Supervisor dừng chờ sau khi task cuối cùng bị abort.

Test hiện có phải đổi:

- `"delivers one background completion with prepared %s context"`, trường hợp `idle`. Supervisor top-level giờ chờ trong `agent_end` thay vì idle, nên kết quả đến bằng follow-up, và model trả lời `"background results 1"` thay vì `"Idle continuation prepared: true"`. Đổi kỳ vọng của trường hợp này. Đường idle (`wakeIdle()`) vẫn được test `"promotes foreground work, retains it across turn abort, ..."` bao phủ, vì test đó abort trước khi task xong. Yêu cầu S1 không đổi.

Các test hiện có cần chạy lại, và sửa nếu giả định cũ thay đổi:

- `"settles a child only after its background grandchild result is consumed"`
- `"consumes one background completion before %s exits"`
- `"stops a settling subtree on %s"`
- `validation/input.test.ts` (trường hợp `settling`)

## Phần E: kiểm tra

Chạy từ thư mục gốc của repo:

```sh
vpr 'pi-subagents#check'
vpr 'pi-subagents#test'
vpr 'pi-tool-display#check'
vpr 'pi-tool-display#test'
vp fmt --check <các file Markdown đã đổi>
node scripts/check-docs.ts <các file Markdown đã đổi>
```

pi-subagents dùng adapter từ `pi-tool-display/adapters`, nên kiểm tra cả hai package. `@pi-mono/utils/idle-wake` chỉ được gọi, không bị sửa.

Kiểm tra thủ công trong TUI bằng `validation/launch-terminal.ts`:

- Chạy một background task chậm. Supervisor hiện trạng thái đang chạy.
- Bấm Escape: supervisor dừng chờ, và task vẫn chạy.
- Gõ input mới: input được xử lý ngay.
- Cho model gọi `subagent_abort`, có và không có pi-tool-display, ở regular và fullscreen. Card giống card `subagent`, hiện `⊘ aborted`, và click mở task. Summary mode đếm `aborted {n} subagent`.

## Các rủi ro đã kiểm chứng

Đã kiểm chứng ngày 2026-10-07 bằng một extension thử nghiệm tạm thời, chạy với Pi 1.0.2 thật (offline provider) ở RPC, print và JSON. Extension đó chờ trong `agent_end`, polling `hasPendingMessages()` và `ctx.signal` mỗi 100 ms. Các file thử nghiệm đã được xoá.

| Rủi ro                                                      | Kết quả                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow-up gửi trong `agent_end` không chạy trước khi settle | **Không xảy ra.** Ở RPC, print và JSON, follow-up gây lượt chạy tiếp trước `agent_before_settle` và `agent_settled`. Print in ra câu trả lời của lượt chạy tiếp.                                                                                                        |
| Lượt chạy tiếp mất prompt đã chuẩn bị                       | **Không xảy ra.** `before_agent_start` chỉ chạy một lần, và system prompt của lượt chạy tiếp vẫn có phần đã chuẩn bị.                                                                                                                                                   |
| `hasPendingMessages()` đếm message do `sendMessage()` gửi   | **Không.** Ngay sau `sendMessage()` follow-up, hàm trả về `false`.                                                                                                                                                                                                      |
| Input mới không làm dừng chờ                                | **Có làm dừng.** RPC `prompt` với follow-up và với steer đều làm `hasPendingMessages()` trả về `true` ở lần polling sau, và Pi chạy tiếp với input đó.                                                                                                                  |
| `ctx.signal` không abort trong `agent_end`                  | **Có abort.** RPC `abort` làm `ctx.signal.aborted` thành `true`. Pi settle mà không chạy `agent_before_settle`.                                                                                                                                                         |
| Escape trong TUI dùng đường khác RPC `abort`                | **Cùng đường.** Escape gọi `session.abort()` khi `session.isStreaming` (`interactive-mode.js:2374-2376`, `:3827-3843`). `isStreaming` trả về `true` trong lúc chờ, vì nó đọc `_isAgentRunActive` (`agent-session.js:1034-1036`). Chưa kiểm tra thủ công trong terminal. |
| Test hiện có mâu thuẫn với yêu cầu của package              | **Không thấy mâu thuẫn** khi đọc test. Chỉ trường hợp `idle` ở trên cần đổi kỳ vọng. Phải chạy cả bộ test sau khi thực hiện mới chắc chắn.                                                                                                                              |

Các quan sát khác:

- Mỗi lượt chạy tiếp phát lại `agent_start` và `agent_end` qua RPC. `child.ts` và `pi-agent-summary` đã xử lý nhiều `agent_start` trong một lần settle.
- Event `agent_end` của RPC chỉ được gửi sau khi handler dừng chờ. Khi parent hủy child, `abort` làm handler dừng chờ, nên child vẫn gửi `agent_end` và checkpoint chạy như cũ. Deadline chung vẫn giới hạn thời gian.
