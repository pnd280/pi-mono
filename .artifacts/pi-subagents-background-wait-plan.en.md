# Plan: wait for background tasks in `agent_end`, and the `subagent_abort` tool

This plan records the original design. For the current result-delivery and cancellation decisions, read [ADR 0001](../packages/extensions/pi-subagents/docs/adr/0001-hold-run-for-background-results.md).

Packages: `packages/extensions/pi-subagents` (package name `pi-subagents`), and the adapter in `packages/extensions/pi-tool-display` (package name `pi-tool-display`). Pi version examined: 1.0.2.

Context and rejected alternatives: [pi-subagents-background-delivery-discussion.md](pi-subagents-background-delivery-discussion.md). Vietnamese version of this plan: [pi-subagents-background-wait-plan.md](pi-subagents-background-wait-plan.md).

Statements about Pi come from the Pi 1.0.2 source. An experiment verified the main risks; see [Verified risks](#verified-risks).

## Agreed decisions

1. The supervisor waits for background tasks in `agent_end` in **all modes and at all depths**: TUI, RPC, print, JSON, and subagent.
2. The supervisor waits only when the last assistant message has `stopReason` `"stop"` or `"toolUse"`, and at least one direct background task is not finished.
3. The wait ends at the **first** of these events:
   - The **first** background task finishes.
   - New input arrives: `ctx.hasPendingMessages()`, polled about every 250 ms.
   - An abort occurs through `ctx.signal`.
4. After the wait ends, results go to the supervisor as follow-ups. At the next `agent_end`, the supervisor waits again if tasks remain.
5. Keep `agent_before_settle` as a fallback at depth > 0 and in print/JSON. It covers errors and `length` stops that Pi does not recover. The fallback also waits for the **first** task (option b) and uses the same wait function.
6. Keep `wakeIdle()` for results that arrive after an abort or after the supervisor is idle.
7. Accept these consequences:
   - After an abort, the supervisor settles while tasks continue to run.
   - Up to N model requests for N tasks.
   - `pi-agent-summary` includes the wait time.
   - `/sesh` commands are blocked during the wait.
8. Add the `subagent_abort` tool:
   - It has only the `task_id` parameter. It aborts only tasks that the supervisor owns.
   - It returns a confirmation immediately. The model that called the abort does not also receive a `cancelled` result.
   - It is model-only, and hidden when the supervisor is at `maxDepth`.
   - The cancellation reason is `"Cancelled by supervisor"`.
   - When the aborted task is a descendant, its intermediate supervisor still receives the `cancelled` result.
   - Its card is consistent with the `subagent` tool: it has its own display adapter in pi-tool-display, and pi-subagents uses that adapter for its own cards.
   - Results that are pending at the time of an abort go to the supervisor through `agent_settled` and `wakeIdle()`.
   - The card status is `⊘ aborted`. The call itself is a success: no `isError`, and no failure state on the card.
   - Summary mode has a new category: `aborted {n} subagent(s)`.
   - The adapter has no automated tests, the same as the existing `subagent` adapter.
9. Do not split the `subagent` tool. Do not add a rule to `AGENTS.md`.
10. The tests for both parts are approved.
11. Order of work: part A, then part B, in one change.

## Part A: the wait mechanism

### A1. Shared wait function in `src/delivery.ts`

Replace `settling` with a shared wait state, and add a function, for example `next(signal?: AbortSignal)`. The function loops until one of these results:

| Condition, checked in this order        | Result     |
| --------------------------------------- | ---------- |
| `Delivery` is closed                    | `"closed"` |
| `pending` contains results              | `"result"` |
| No direct background task is unfinished | `"none"`   |
| `ctx.hasPendingMessages()` is `true`    | `"input"`  |
| `signal?.aborted`                       | `"abort"`  |

Between checks, the function waits for the first of these events:

- `completed()` signals a change, through an internal notification promise.
- The 250 ms poll interval ends.
- The `abort` event of `signal`.

The function must remove its timer and listeners when it ends.

Changes to `completed()`:

- During a wait, only add the result to `pending` and notify the wait function. Do not call `sendMessage`.
- For a task in the "suppressed" set (see B2): mark it `delivered`, do not add it to `pending`, but notify the wait function so that it counts the remaining tasks again.
- Outside a wait: no change (follow-up while running, `wakeIdle()` when idle).

Only one wait occurs at a time, because Pi calls `agent_end` and `agent_before_settle` in sequence.

### A2. The `agent_end` handler

Add `Delivery.end(event, ctx)`, and register it in `src/index.ts` with `pi.on("agent_end", ...)`.

1. Return if `Delivery` is closed.
2. Find the last assistant message in `event.messages`. Return if there is none, or if its `stopReason` is not `"stop"` or `"toolUse"`.
3. Call `next(ctx.signal)`.
4. Act on the result:
   - `"result"`: call `take()`, then send each message with `pi.sendMessage(message, { deliverAs: "followUp", triggerTurn: true })`. Pi continues before it settles (`agent-session.js:1384-1386`).
   - `"input"`, `"none"`, `"closed"`: return. Pi processes its queue.
   - `"abort"`: return, and keep `pending` for A4.

### A3. Fallback in `settle()`

- Keep the current condition: return at depth 0 when the mode is not print or JSON.
- Replace `Promise.all` with `next()`, without a signal, because `ctx.signal` is `undefined` at this point.
- `"result"`: return `custom_message` entries with `continue: true`, as now.
- Other results: return `undefined`. For `"input"`, Pi continues because its queue has messages (`agent-session.js:1427`).
- Known limit, unchanged from now: an abort during this wait does not end the wait.

The handler in `src/index.ts` continues to keep `event.entries` from earlier handlers.

### A4. Deliver remaining results after an abort

A result can go into `pending` at the same time as an abort. Add `Delivery.settled(ctx)`, and register it with `pi.on("agent_settled", ...)`. If `pending` has results and `ctx.isIdle()` is `true`, deliver them with `wakeIdle()`.

### A5. `src/index.ts`

- Register `agent_end` and `agent_settled`.
- Do not change `bind()` or `shutdown()`. `Delivery.shutdown()` must release a wait in progress: it notifies the wait function, and the function returns `"closed"`.

## Part B: the `subagent_abort` tool

### B1. Schema and tool

- Add `abortInputSchema` to `src/tool-schema.ts`: `z.strictObject({ task_id: z.string().min(1).describe(...) })`.
- Add `createAbortTool(tasks, delivery)`, in a new file `src/abort-tool.ts` or in `src/tool.ts`. Choose the location as `docs/agents/architecture.md` specifies.
  - `name: "subagent_abort"`, `executionMode: "parallel"`.
  - Short description: abort a task only when its result is no longer necessary; its session can be resumed with `task_id`.
- Register it in `bind()`, with the same condition and exposure as the `subagent` tool (`src/index.ts:130-131`).
- Register a renderer for `subagent_abort` in the same way as for `subagent` (`src/index.ts:51`, `src/render.ts`): `createToolDisplayRenderers("subagent_abort", subagentAbortDisplayAdapter)`, in the same `MouseRegion`, so that a click opens the task. Make `createRenderers()` accept the adapter and the tool name, so that no code is copied.

### B2. Execution

1. Call `tasks.owned(task_id)` to check ownership. If the task is a direct live task (`tasks.active(task_id)`), call `delivery.suppress(task)` **before** the abort.
2. Call `tasks.abort(task_id)`. This function already handles direct tasks and descendants (`src/tasks.ts:797-808`).
   - The reason is now fixed as `"Cancelled by user"`. Add a `reason` parameter to `Tasks.abort()`, and use `"Cancelled by supervisor"` for this tool.
3. Return a result with the same shape as the `subagent` tool, so that the adapter and the model read it in the same way:
   - `details`: the task's `ToolDetails` after the abort: `task_id`, `binding_id`, `description`, `model`, `thinking`, `background`, `state: "cancelled"`, `started_at`, `ended_at`, `usage`. For a direct task, use `task.details`. For a descendant, build it from the `TaskRecord` that `tasks.abort()` returns.
   - `content`: a task envelope (`formatTaskEnvelope`) with `state: "cancelled"` and a short body: the task is aborted, and it can be resumed with `task_id`.
   - Do **not** set `isError`, because the abort succeeded. Do not use `taskResult()` unchanged, because it sets `isError` for the `cancelled` state.
4. Keep the current error messages: `"Task does not belong to this session"`, `"Task is inactive"`.

An aborted descendant completes at the supervisor that owns it. That supervisor receives the `cancelled` result as usual, because its model did not call the abort.

The user command `/subagents abort` does not change: the model still receives the `cancelled` result.

### B3. Interaction with the wait

When the last task is aborted, `completed()` notifies the wait function, and the function returns `"none"` with no results. The supervisor stops waiting, and no model request occurs.

### B4. Display adapter in pi-tool-display

Follow `packages/extensions/pi-tool-display/docs/adapters.md`, section "Add an adapter".

- `src/adapters/pi-subagents/index.ts`:
  - Add `subagentAbortDisplayAdapter`, id `"pi-subagents:subagent_abort"`, family `"invocation"`.
  - `supports`: the arguments are `{ task_id: string }` (strict), and `details` matches the adapter's existing `detailsSchema`.
  - `progress`: label `"Subagent"`, the task description, identity `model:thinking`, and the `task_id` field. The status uses the cancelled glyph with the text `"aborted"`. The secondary line shows usage, as the current cancelled card does. Before details exist, the description is the `task_id`.
  - `action`: open the task with `pi-subagents:open`, the same as the `subagent` tool.
  - `outcome`: do not return `"cancelled"` for the call itself, because the call succeeded.
  - `textParts`: remove the task envelope, as the `subagent` adapter does.
  - Summary: a new category `subagent-aborts`, with `"aborted {n} subagent"` and `"aborted {n} subagents"`, and `task_id` as the identity.
  - Extend `piSubagentAdapter`: use the same provenance check. When `tool.name === "subagent_abort"`, check for a required `task_id` string parameter, then return the new adapter.
  - Use the existing `usage` and `fields` functions; do not copy them.
- `src/adapters/recorded.ts`: add the contract `"pi-subagents:subagent_abort"`. Do not change `ADAPTER_CONTRACT_VERSION`, because this adds a new contract and does not change an existing one.
- `src/adapters/index.ts`: export `subagentAbortDisplayAdapter`, so that pi-subagents can import it from `pi-tool-display/adapters`.
- `src/host/selection.ts`: no change, because `piSubagentAdapter` is already in the resolver list.
- The existing `subagent` adapter has no automated tests; its README uses manual checks. The new adapter follows the same approach. Do not add automated adapter tests.

## Part C: documentation

- `README.md`, Usage section:
  - In all modes, the supervisor stays busy while background tasks remain. New input or an abort ends the wait.
  - Results arrive each time a task finishes.
  - Add `subagent_abort`.
  - Note that `pi-agent-summary` includes the wait time, and that commands that need an idle session are blocked.
- `docs/testing.md`: update S1, S4, and S5 for the new wait, and add the test items from part D.
- `docs/pi-compatibility.md`, section "Background and viewer contracts". Add these contracts:
  - Pi awaits `agent_end` handlers before post-run processing.
  - `ctx.signal` is live during `agent_end`.
  - `event.messages` contains `stopReason`.
  - A follow-up sent during `agent_end` runs before the session settles.
  - `hasPendingMessages()` counts only input through `prompt()`, not `sendMessage()`.
  - Update the line that says that a child waits in `agent_before_settle`.
- `packages/extensions/pi-tool-display/src/adapters/pi-subagents/README.md`: describe the contract, card, and summary of `subagent_abort`.
- `src/guidance.ts`: no change. If the model needs guidance about `subagent_abort`, put it in the description of the new tool.

## Part D: tests (approved)

Add tests to `validation/background.test.ts` and `validation/input.test.ts`. Add scenarios to `validation/provider.ts` as necessary.

1. The wait ends when the first task finishes, while slower tasks continue. Each result arrives exactly once, at top-level RPC and in print/JSON.
2. An abort during the wait ends the wait and does not cancel background tasks. A later result still arrives through `wakeIdle()`.
3. New input (follow-up or steer) to a waiting supervisor is processed without a wait for a task to finish.
4. Error without retry: at depth > 0 and in print/JSON, `settle()` still waits and delivers results.
5. Retry and compaction are not blocked: a failed run that can retry does not wait.
6. `subagent_abort`:
   - It stops the task and releases capacity.
   - The session can be resumed.
   - It rejects tasks that the supervisor does not own, and tasks that are finished.
   - No additional `cancelled` result is delivered.
   - The supervisor stops waiting after the last task is aborted.

Existing test that must change:

- `"delivers one background completion with prepared %s context"`, case `idle`. The top-level supervisor now waits in `agent_end` and does not become idle. The result arrives as a follow-up, and the model replies `"background results 1"`, not `"Idle continuation prepared: true"`. Change the expectation for this case. The test `"promotes foreground work, retains it across turn abort, ..."` still covers the idle path (`wakeIdle()`), because it aborts before the task finishes. Requirement S1 does not change.

Existing tests to run again, and to change if an old assumption is no longer true:

- `"settles a child only after its background grandchild result is consumed"`
- `"consumes one background completion before %s exits"`
- `"stops a settling subtree on %s"`
- `validation/input.test.ts` (case `settling`)

## Part E: verification

Run from the repository root:

```sh
vpr 'pi-subagents#check'
vpr 'pi-subagents#test'
vpr 'pi-tool-display#check'
vpr 'pi-tool-display#test'
vp fmt --check <changed Markdown files>
node scripts/check-docs.ts <changed Markdown files>
```

pi-subagents uses the adapter from `pi-tool-display/adapters`, so check both packages. `@pi-mono/utils/idle-wake` is only called; it does not change.

Manual checks in the TUI with `validation/launch-terminal.ts`:

- Start a slow background task. The supervisor shows that it is running.
- Press Escape: the wait ends, and the task continues.
- Type new input: the supervisor processes it immediately.
- Make the model call `subagent_abort`, with and without pi-tool-display, in regular and fullscreen modes. The card looks like the `subagent` card, shows `⊘ aborted`, and a click opens the task. Summary mode counts `aborted {n} subagent`.

## Verified risks

Verified on 2026-10-07 with a temporary test extension on real Pi 1.0.2 (offline provider) in RPC, print, and JSON modes. The extension waited in `agent_end` and polled `hasPendingMessages()` and `ctx.signal` every 100 ms. The test files were deleted after the run.

| Risk                                                        | Result                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A follow-up sent in `agent_end` does not run before settle  | **Did not occur.** In RPC, print, and JSON, the follow-up caused a continuation before `agent_before_settle` and `agent_settled`. Print mode printed the reply of the continuation.                                                                                                   |
| The continuation loses the prepared prompt                  | **Did not occur.** `before_agent_start` ran only once, and the continuation's system prompt kept the prepared content.                                                                                                                                                                |
| `hasPendingMessages()` counts messages from `sendMessage()` | **No.** Immediately after a follow-up `sendMessage()`, the function returned `false`.                                                                                                                                                                                                 |
| New input does not end the wait                             | **It ends the wait.** RPC `prompt` with follow-up and with steer made `hasPendingMessages()` return `true` at the next poll, and Pi continued with that input.                                                                                                                        |
| `ctx.signal` does not abort during `agent_end`              | **It aborts.** RPC `abort` set `ctx.signal.aborted` to `true`. Pi settled without `agent_before_settle`.                                                                                                                                                                              |
| Escape in the TUI uses a different path from RPC `abort`    | **Same path.** Escape calls `session.abort()` when `session.isStreaming` is `true` (`interactive-mode.js:2374-2376`, `:3827-3843`). `isStreaming` is `true` during the wait, because it reads `_isAgentRunActive` (`agent-session.js:1034-1036`). Not checked manually in a terminal. |
| An existing test conflicts with a package requirement       | **No conflict found** in the test code. Only the `idle` case above needs a new expectation. A full test run after the change is necessary to be sure.                                                                                                                                 |

Other observations:

- Each continuation emits `agent_start` and `agent_end` again through RPC. `child.ts` and `pi-agent-summary` already handle more than one `agent_start` before a settle.
- The RPC `agent_end` event is sent only after the handler ends its wait. When a parent cancels a child, the `abort` ends the handler's wait, so the child still sends `agent_end`, and the checkpoint runs as before. The shared deadline still limits the time.
