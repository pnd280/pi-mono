# pi-subagents

Delegate independent work to separate Pi processes and receive their final results in your current conversation.

```text
Ask two subagents to review the parser and the documentation, then summarise their findings.
```

## Usage

Your current Pi session is the supervisor. Its model calls `subagent` with a short `description` and a detailed `prompt`. Foreground calls wait for completion; `background: true` returns a task ID and delivers the result automatically. Each child starts with a fresh conversation in the same working directory. Supply the context it needs, and keep parallel edits in different files.

- Set `task_id` to continue a task with its earlier conversation. An inactive task resumes; an active task receives input and returns immediately. IDs appear in tool results and `/subagents list`.
- Use `delivery: "follow_up"` (the default) to add input after the current work, or `delivery: "steer"` to deliver it before the next model request. Active-task input uses the existing capacity slot and result destination, and reports no additional usage.
- Active descendant input is routed to its current supervisor. Resuming an inactive descendant transfers it to the caller, and the task tree reflects its new owner.
- Omit `model` and `thinking` to use the supervisor's current selection, including on resume. A model override uses `provider/id`; Pi resolves it and the provider validates availability. Cards, the panel, and the board show the requested selection while a task is queued, the child's resolved model and clamped thinking level from launch, and then the physical model and thinking level of its latest response.
- Aborting the supervisor's turn immediately force-stops its running foreground subtrees and cancels queued foreground calls.
- Child dialogs appear with a `[subagent: <description>]` prefix. RPC clients answer them using Pi's [extension UI protocol](https://pi.dev/docs/latest/rpc-extension-ui).

The tools are model-only: codemode scripts cannot invoke them. At `maxDepth`, both are hidden. Only the supervisor model sends task input.

### Background tasks

Background tasks survive turn aborts. Use them only for independent work; wait for their automatic result instead of polling or duplicating their work.

- In all modes, a supervisor stays busy after a normal reply while its direct background tasks run. Each time a task finishes, its result continues the same run before the supervisor waits for the next task.
- New input or an abort ends the wait after a normal reply. The tasks continue, and a later result starts a new turn when the supervisor is idle.
- A child consumes the results of its background descendants before returning.
- Print and JSON supervisors wait before exiting.
- A reply that fails and that Pi retries does not wait.
- If Pi does not recover an error or length-truncated reply, children and print or JSON supervisors still wait for background results. An abort cannot interrupt this wait.
- The waiting time counts as busy time, for example in `pi-agent-summary`, and commands that need an idle session are blocked until the wait ends.

In TUI mode, the `pi-subagents.waiting` component adds “Waiting for background subagents” to the [shared working message](../../libs/src/working-message/README.md) during the wait; `/working-message` orders it.

### Cancel a task

The model calls `subagent_abort` with a `task_id` when an active owned task's result is no longer necessary. This includes owned descendants.

A successful call returns a confirmation, and the model receives no separate `cancelled` result. An intermediate supervisor still receives the result of its own child. The task session remains resumable.

If the task finished before cancellation, the call reports an inactive task and preserves its actual result. Descendant cancellation is confirmed by the owning supervisor; its errors reach the caller.

### Commands

| Command                                                      | Result                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/subagents`                                                 | The task panel in TUI mode; the first page elsewhere.                                                                   |
| `/subagents list [--offset <n>] [--limit <n>]`               | A JSON page in depth-first launch order.                                                                                |
| `/subagents show <task_id> [--since <cursor>] [--limit <n>]` | A compact transcript digest with cumulative child usage.                                                                |
| `/subagents show <task_id> --last`                           | The latest assistant text and its entry cursor, or `null` when absent.                                                  |
| `/subagents abort <task_id>`                                 | Cancel an active task; its session remains resumable.                                                                   |
| `/subagents background [task_id]`                            | Move foreground work to the background. Without an ID, move all direct foreground children of the top-level supervisor. |

Commands produce one JSON notification outside model context. RPC clients send slash commands through `prompt`, including while the supervisor is working. Errors return `{ "error": "…" }`.

List results contain `{ tasks, total, offset, next_offset }`. Offset defaults to 0; limit defaults to 20 and accepts 1 to 100. Follow `next_offset` until it is `null`. Each page fits 50 KiB and may contain fewer items than requested; an item too large to fit alone returns an error. Pages read the current list, so restart at offset 0 if it changes while paging.

### Branch history

Task state belongs to the selected parent ancestry. Tree navigation, parent-session fork, and session switch immediately force-stop all owned running subtrees, including background work. Selecting the current leaf and sending ordinary messages leave tasks running. Restored tasks are stopped; they never restart automatically.

The latest checkpoint on that ancestry is authoritative. Checkpoints contain completed child messages and task-state changes, with captured descendant state. They exclude unfinished streaming text. Explicit resume copies the saved conversation into a new child session and keeps the public `task_id`; `session_id` and `session_file` identify the concrete run. An interrupted tool cycle produces a warning: old calls are not replayed automatically, completed effects remain, and the model can request the operation again.

Old records without checkpoints are excluded. Their files remain unchanged. User-requested branch summaries can carry information from the branch being left, but summaries never supply task ownership.

### Transcript digests

`show` returns user text, assistant text, and validated final tool-run summaries on the selected checkpoint ancestry. Thinking, tool arguments, tool outputs, and progress revisions are excluded. Sessions without display metadata still supply text items.

- Without `--since`, the response contains the latest items and `omitted`, the count of earlier items.
- With `--since <cursor>`, it contains the first items after that entry and `more`, which indicates whether another page is available. Pass the returned `cursor` to read forward; an unknown cursor is an error.
- `--limit` is an integer from 1 to 100 and defaults to 20. Digest text items are cut at 2,000 bytes; complete JSON pages fit 50 KiB and may contain fewer items than requested.
- `usage` covers the selected child ancestry, including reported descendant usage. Late background descendant usage is included when its result was delivered to that descendant's supervisor.
- `--last` returns `{ task_id, state, cursor, text }` from the active conversation, using the same text limits as the tool result. It follows the same ancestry as the digest.

Reading a digest never modifies the child session. `session_file` from `list` identifies the original concrete session; it can contain later data and is not the historical view's source.

### Task panel

Press **Ctrl+Alt+S** or run `/subagents` to open the task panel in TUI mode.

The panel uses the layout of the shared collection browser. A `View:` row lists the **all**, **running**, **background**, and **finished** views with their task counts; **Tab** and **Shift+Tab** change the view, and each view keeps its own selection. Task trees are listed running first, then background, then finished. A tree goes in the place of its most active task, so a finished parent with a running background child is listed with the background tasks. In a view that excludes a parent, its listed children are roots. Nested tasks hang from their parent's status glyph with `├─`, `└─`, and `│` guides, and each task keeps its own status glyph: `•` running, `◐` background, `✓` completed, `✗` failed, or `⊘` cancelled. Each task has one row: the glyph, the description, and then, muted, `provider/model:thinking`. The other muted details are aligned to the right edge: `failed` or `cancelled` for those outcomes, the latest run's elapsed time or duration, the current tool of an active direct child, total tokens such as `↑12k ↓3.0k`, and the total cost. While a task is active, its context use such as `48k/200k` (used/total, `?` when unknown after compaction) replaces the tokens; the tokens return when it settles. Usage goes up while a task runs and adds up across resumes. Values that are zero or that a record saved by an earlier version does not have are left out. When a row is wider than the panel, the model and the details move to their own rows, and the details stay aligned to the right edge. Long text wraps under the description. Wrapped rows continue the tree guides, and a parent's wrapped rows carry a `│` stem down to its children. A `(n/m)` line under the list shows the selection position. Use **PageUp/PageDown** or the fullscreen mouse wheel to scroll the list.

The panel has top and bottom borders, like the other custom views. They do not count hidden rows: the `(n/m)` line shows the position. A `→` cursor and the accent colour mark the selected task. The viewer title shows a `background` badge for active background tasks. Use **Up/Down** to select, **Enter** to inspect, **Ctrl+D** to abort an active task, and **Ctrl+B** to move foreground work to the background. The footer shows **Ctrl+D** and **Ctrl+B** only when they apply to the selected task. In regular mode, the transcript viewer replaces the task list inline and uses three-quarters of the terminal height. In fullscreen mode, it opens as a full-terminal overlay. Both presentations have top and bottom borders that show the number of transcript rows hidden above and below. The borders fit within the height limit; there are no outer margins. **Esc** returns to the task list with its view and selection preserved; press it again to close the panel. These keys belong to the panel only while it has focus.

The read-only viewer follows the selected task's live branch or stopped checkpoint. Its info line, directly above the key hints, shows the current task description, model, and thinking level, the latest context use such as `48k/200k`, and the same details as the list row with the full usage, such as `↑30 ↓7.4k R325k W42k CH98.5% $0.552`: cache reads (`R`) and writes (`W`), the latest request's cache hit rate (`CH`), and the cost to three decimals. It wraps within the space left after reserving the key hints and at least one transcript row when the screen has room inside the borders. **Ctrl+O** cycles its local summary, compact, and verbose modes. Use **Up/Down**, **PageUp/PageDown**, **Home**, and **End** to scroll within the viewer's bounded transcript area; its info line and key hints stay in place. In fullscreen mode, the mouse wheel also scrolls, and you can click or drag the scrollbar. A spinner animates in the info line while the task is active, and **Ctrl+D** aborts it. Active direct children stream live; deeper children refresh at completed-message boundaries. Missing or invalid checkpoints show an unavailable-history diagnostic; they never fall back to the latest child file.

Tool cards describe their call. The first line shows the description and a status: `preparing`, `◌ waiting to run`, or `◌ starting` before the task reports, then `◌ queued` or the elapsed time while active, `✓` with the final time, or `✗ failed` or `⊘ cancelled` with the time. The second line shows the model and thinking level, then `Waiting for capacity`, usage such as `↑48k ↓3.1k $0.21`, or, for failures, usage and then the first line of the error. Before the task reports, only an explicitly requested model or thinking level appears. Completed cards preview the first three reply lines under a `└` branch. Long lines wrap with indentation. This layout also applies to completion cards and remains the same without the automatic `pi-tool-display` adapter. Expansion adds the task ID, non-default options, the first ten prompt lines, and retained output. A call that returns while its task keeps running shows the fixed `↗ in background`, `↪ input queued`, or `↪ steered` with its task ID; use the panel or widget for live state. A successful `subagent_abort` card uses the same layout with the aborted task's description, `⊘ aborted`, and its usage; the call itself is not shown as failed. Summary mode counts these calls as “aborted {n} subagent(s)”.

The `↓ N subagents` widget counts active tasks throughout the tree and alternates between `muted` and `dim` every 600 ms. It disappears when no tasks remain active. Fullscreen clicks on the widget open the panel; tool and completion cards open the corresponding viewer.

Cards do not show activity; the tool's `activity` detail names the latest tool while calls are unfinished. When `pi-tool-display` is loaded in a child, verified run summaries supply activity such as “Read 4 files” once those calls finish. The viewer uses shared display components and supported recorded contracts; unsupported original renderers become generic cards. Preparing calls follow [pi-tool-display's foreign-viewer limits](../pi-tool-display/README.md#known-limits). Live saved-output previews are bounded. Historical expansion uses recorded content and reports unavailable external output instead of reading a mutable file. Viewing never executes tools or rewrites child sessions.

## Configuration

Add `ext.pi-subagents` to Pi's global `settings.json` or the trusted project's `.pi/settings.json`. These are the default limits:

```json
{
  "ext.pi-subagents": {
    "maxDepth": 2,
    "maxConcurrent": 8,
    "maxQueued": 8
  }
}
```

| Setting         | Meaning                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `maxDepth`      | A non-negative integer. `0` disables launches; `2` permits children and grandchildren.                                         |
| `maxConcurrent` | A positive integer limiting the whole live task tree, including reserved launches and stopping processes.                      |
| `maxQueued`     | A non-negative integer limiting launches waiting for capacity in FIFO order. `0` rejects a launch when all slots are occupied. |

Settings load at session start. Valid trusted-project values override global values; invalid values are ignored. See Pi's [settings reference](https://pi.dev/docs/latest/settings) for its own settings.

Top-level launches queue FIFO when capacity is full. Nested launches fail immediately with the configured capacity in the error; a task never waits for capacity held by its own ancestors.

## Side effects

- Children have normal Pi tools and permissions. A research prompt does not make a child read-only, and there is no workspace isolation.
- Each child saves a Pi session. The supervisor saves bounded checkpoint references on its branch and immutable checkpoint data under the agent directory's `pi-subagents/checkpoints/`. Checkpoints and resume copies are not automatically deleted. Saved active records recover as cancelled.
- Adopting an inactive descendant first saves a transfer intent on the receiving branch, then records the transfer in both supervisors. The former supervisor's receipt names the recipient, so a failed recipient write can be retried or recovered after restart when that branch contains the intent. Receipt checks grant no newer conversation history. A stopped former supervisor's session is locked while its current ownership is checked and the receipt is appended.
- Child model calls can incur provider charges. Usage until the tool call returns contributes through the tool result. When a background result is delivered, the later usage is added to supervisor totals as a hidden Pi `usage` entry attributed to the child's last reported model; completion details show the full run usage. Usage after the call returns is not counted if its result is never delivered, such as a cancellation after `subagent_abort` or a result pending at shutdown. If a stopped child cannot report usage, that call reports none.
- Successful compaction adds a hidden reminder of direct task IDs without starting a new turn.
- Children inherit the environment, working directory, and project-trust decision. They load their own configured extensions and tools. Other supervisor CLI flags, including `-e`, `--tools`, `--session-dir`, and `--no-session`, are not forwarded.
- Completion closes child stdin; cancellation also clears queued input and requests abort. Explicit task cancellation captures terminal events before closing stdin, without waiting for blocked settle handlers. Cancellation, capture, and shutdown share the same grace period. The grace period is 5 seconds plus 7 seconds per possible remaining descendant level, bounded by `maxDepth` and `maxConcurrent`. With default limits, children receive 12 seconds and grandchildren 5 seconds. On Linux and macOS, a live supervisor then sends SIGTERM to the child process group, followed by SIGKILL after 2 more seconds if needed. Graceful exit waits for cleanup. Navigation and foreground abort use a separate immediate path: Unix stops the live owned tree during process discovery, then sends SIGKILL to its groups and descendants; Windows uses forced tree termination. Capacity remains reserved until process exit is observed.

### Limits

After supervisor SIGKILL, children rely on cooperative stdin-EOF shutdown. A child that blocks shutdown can remain alive with its commands; there is no independent watchdog.

Force-kill does not reverse file changes and can bypass child cleanup. After a cancelled child exits, the supervisor saves cancellation evidence for unfinished calls observed on its live connection. It does not invent tool output or a duration. Calls without cancellation evidence remain unavailable, and old checkpoints stay unchanged. Stopped-owner adoption creates a temporary `<session_file>.pi-subagents.lock`. A crash while holding it can leave the lock behind, and later adoption times out rather than reclaiming it automatically. Remove that lock only after all supervisors using the affected session have stopped.

Linux has automated coverage. macOS uses the same process-group path but has not been verified. Windows code paths are untested and not officially supported. A model can bypass extension depth limits by running Pi itself through `bash`.

Tool output is truncated using Pi's 2,000-line and 50 KiB defaults. Task records over 1 MiB are rejected when written and ignored during recovery. Each checkpoint is limited to 64 MiB; capture failure leaves the previous saved checkpoint unchanged. The full child session path is available in the list response.

## Validation

The offline e2e suite uses real Pi processes and Linux `/proc` to check cleanup. See [coverage](docs/testing.md) and the [maintainer compatibility checklist](docs/pi-compatibility.md).

For manual terminal checks, run from the repository root:

```sh
vpr 'pi-subagents#validate:terminal' regular
```

Use `fullscreen` for Pi's fullscreen mode. The launcher prints a disposable workspace path and retains it for replay with `--reuse <directory>`. Exit Pi and check that its processes have stopped before removing that directory.
