# Task panel, viewers, and cards

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

In TUI mode, pi-subagents shows tasks and [jobs](jobs.md) in a task panel, read-only viewers, tool cards, and a widget. The keys listed below are defaults; the [panel controls](#panel-keys) follow Pi's current bindings.

## Task panel

Press the [`shortcut`](../README.md#configuration), **Ctrl+Alt+S** by default, or run `/subagents` to open the task panel in TUI mode. The panel has top and bottom borders, like the other custom views.

The `shortcut` setting does not accept **Esc** or a function key with a modifier, such as `ctrl+escape` or `alt+f5`.

If the shortcut overlaps a key claimed by pi-profiles or pi-prompt-manager, neither extension gets its shortcut, and a warning names the conflict.

Pi skips a shortcut when it detects a conflict with one of its reserved keys, such as `shift+tab` under the default bindings, and shows a warning. Pi's conflict check does not detect every equivalent key combination. Use `/subagents` instead, or set another `shortcut` and run `/reload`.

The panel has the same layout as the list browsers of other workspace extensions, such as pi-todo. A `View:` row lists the "all", "running", "background", and "finished" views with their counts of tasks and jobs; **Tab** and **Shift+Tab** change the view, and each view keeps its own selection.

### Task rows

- Task trees are listed running first, then background, then finished. A tree goes in the place of its most active task, so a finished parent with a running background child is listed with the background tasks. In a view that excludes a parent, its listed children are roots.
- Nested tasks connect to their parent's status glyph with `├─`, `└─`, and `│` guides, and each task keeps its own status glyph: `•` running, `◐` background, `✓` completed, `✗` failed, or `⊘` cancelled.
- Each task has one row: the glyph, the description, and then, muted, `provider/model:thinking`. The other muted details are aligned to the right edge: `failed` or `cancelled` for those outcomes, the latest run's elapsed time or duration, the current tool of an active direct child, total tokens such as `↑12k ↓3.0k`, and the total cost.
- While a task is active, its context use such as `48k/200k` (used/total, `?` when unknown after compaction) replaces the tokens; the tokens return when it settles. Usage goes up while a task runs and adds up across resumes. Token and cost details omit zero or unknown values.
- When a row is wider than the panel, the model and the details move to their own rows, and the details stay aligned to the right edge. Long text wraps under the description. Wrapped rows continue the tree guides, and a parent's wrapped rows carry a `│` stem down to its children.

A `(n/m)` line under the list shows the selection position; the borders do not count hidden rows. Use **PageUp/PageDown** or the fullscreen mouse wheel to scroll the list.

### Panel keys

A `→` cursor and the accent colour mark the selected task. The panel and both viewers read Pi's current selection bindings. The task viewer also reads Pi's tool-expansion binding. Input handling and footer hints use the same bindings, including after a host binding change.

| Default key         | Action                                                                                       | Pi binding                                 |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Up/Down**         | Select a task in the list or scroll a viewer.                                                | `tui.select.up`, `tui.select.down`         |
| **PageUp/PageDown** | Scroll by a page.                                                                            | `tui.select.pageUp`, `tui.select.pageDown` |
| **Enter**           | Inspect the selected task or job.                                                            | `tui.select.confirm`                       |
| **Esc**             | Return from a viewer to the list with its view and selection preserved; close from the list. | `tui.select.cancel`                        |
| **Ctrl+O**          | Expand or collapse messages in the task viewer.                                              | `app.tools.expand`                         |

Local actions retain their fixed keys: **Tab** and **Shift+Tab** change the list view, **Ctrl+B** promotes a foreground task from the list, **Ctrl+D** aborts from the list or a viewer, and **Home** and **End** scroll to the ends of a viewer.

When bindings overlap, the first applicable action wins in this order: back or close, inspect (list only), up, down, page up, page down, expand (task viewer only), then local actions. A configured binding therefore takes precedence over a local key, and the other alternatives that do not conflict still work.

Edge cases:

- A shown action with no usable binding says "unavailable". Its default key is not restored.
- The back or close action excludes **Ctrl+C**. That key stays with Pi's copy or interrupt handling unless another configured panel action claims it.
- Key-release events perform no action.

The footer shows abort and background actions only when they apply to the selected item. Controls belong to the panel or viewer only while it has focus.

The panel keeps the close hint first when space is limited. Below ten terminal rows, the list shows only the close binding and a resize instruction; list actions are disabled. The viewers keep their separate height limits.

### Jobs in the panel

Jobs are root rows. An active job is in the "background" view with the `◐` glyph, and an ended job is in the "finished" view with its outcome glyph. In each group, jobs follow the task trees.

A job row shows the description, the muted word `job` in place of the model, and then the same right-aligned details as a task: `failed` or `cancelled`, the elapsed time or duration, and the exit code such as `exit 2`. **Enter** opens the job's log viewer. **Ctrl+D** aborts an active job, and its `cancelled` result is delivered. **Ctrl+B** does not apply to jobs.

## Viewers

The task viewer and the job log viewer have the same frame. In regular mode, the viewer replaces the task list inline and uses three-quarters of the terminal height. In fullscreen mode, it opens as a full-terminal overlay. The borders fit within the height limit; there are no outer margins.

- The top border shows a `TASK` or `JOB` chip, the bold description, and then, dim, the kind and the first eight characters of the ID, such as `task 8f3a2c1e`. When the ID would leave the description less than 16 columns, the ID drops out.
- Below the top border, metadata rows show dim labels in one column and their values; in a very narrow viewer, each label is above its values. Long values wrap under the value column between their parts, so no row ends with a separator; a part wider than the column wraps on its own rows.
- Then come a border, the transcript or the log, a blank row, diagnostics, the key hints, and the bottom border. The borders around the body show the number of rows hidden above and below.

When the viewer has too few rows, it keeps the borders, one body row, and the first hint row with the current back binding (or "back unavailable"); below five rows, the hint row drops out, and below four, the body row. Then diagnostics, the metadata rows from the top, the other hint rows, and the blank row get the free rows, in that order.

### Task viewer

The read-only viewer follows the selected task's live branch or the history of its selected run. Its metadata rows follow the task's live record:

- `status`: a spinner and the elapsed time while the task is active, then `foreground` or `background`. After the run ends, `✓ completed in`, `✗ failed after`, or `⊘ cancelled after` the duration, such as `1m 12s`; a run without an end time shows only the outcome. For a descendant, `launched by` and the parent's description follow.
- `model`: the resolved model, then `thinking` and the thinking level.
- `usage`: the total usage in the format of the [pi-editor-widgets](../../pi-editor-widgets/README.md) token and context widgets, such as `↑30 ↓7.4k R325k W42k CH98.5% $0.552 • 48k/200k (24.0%)`: cache reads (`R`) and writes (`W`), the latest request's cache hit rate (`CH`), the cost to three decimals, and the latest context use. Zero token counts and a zero cost are left out. A known cache hit rate shows, including zero, when the task has reported cache reads or writes. Known context use also shows when zero; unknown use shows `?/200k` without a percentage.
- `error`: the first line of a failed or cancelled run's result.

Pi's `app.tools.expand` binding, **Ctrl+O** by default, expands and collapses tool calls and other expandable messages. Use **Up/Down**, **PageUp/PageDown**, **Home**, and **End** to scroll within the viewer's bounded transcript area; its metadata rows and key hints stay in place. In fullscreen mode, the mouse wheel also scrolls, and you can click or drag the scrollbar. **Ctrl+D** aborts an active task.

Active direct children stream live; deeper children refresh at completed-message boundaries. A missing, invalid, or too large child file shows an unavailable-history diagnostic.

The viewer shows the child's messages with Pi's chat components. Pi's built-in tools use their own renderers, `subagent` and `subagent_abort` calls use the [tool cards](#tool-cards), other tools use Pi's generic card, and background results use Pi's default message box. Images are not shown.

- A failed or aborted response supplies an error for calls without a saved result. Other calls without a final result show "Interrupted" after any partial output when the task stops or an earlier run left them unfinished.
- Removing a saved result from model context does not change its recorded completion.
- Viewing uses only recorded content: it never executes tools, reads the files that calls or results name, or rewrites child sessions.

### Job log viewer

The log viewer shows the end of the job's log file: at most 2,000 lines or 50 KiB, plus an `[Earlier output omitted]` line when output is excluded from that window. It also retains the `[Earlier output omitted: N bytes]` marker when the [log file's size limit](jobs.md#log-files) removed output. While the job is active, the viewer reads the file again every second and follows new output. It reads the file once more when the job ends. Its metadata rows are:

- `status`: a spinner and the elapsed time while the job is active. After the job ends, the outcome and the duration as for a task, then `exit code` and the exit code, or `none`.
- `command`: each line of the command, after `$ `.
- `log`: the log file path.
- `error`: the job's error, only when it adds to the exit code, such as `timed out after 60 s`.

Use **Up/Down**, **PageUp/PageDown**, **Home**, and **End** to scroll; in fullscreen mode, the mouse wheel also scrolls. **Ctrl+D** aborts an active job, and **Esc** returns to the list. A missing or unreadable log file shows a diagnostic. An empty log shows "(no output)".

## Tool cards

Tool cards use Pi's tool box, whose background shows a pending, successful, or failed call. The first line names the tool and the description.

### Task card status

The `status` row follows the call's progress:

| Phase                   | Status                                                |
| ----------------------- | ----------------------------------------------------- |
| Before the task reports | `preparing call`, `◌ waiting to run`, or `◌ starting` |
| Waiting for capacity    | `◌ queued, waiting for capacity`                      |
| Running                 | `running for` the elapsed time                        |
| Completed               | `✓ completed in` the recorded duration                |
| Failed                  | `✗ failed after` the recorded duration                |
| Cancelled               | `⊘ cancelled after` the recorded duration             |

Durations use formats such as `450ms`, `5.3s`, or `1m 5s`; live elapsed time counts whole seconds. A stopped card without an end time omits the time. An error result replaces the last reported state, so an interrupted running call shows `✗ failed`.

While the task runs, `· now` names its activity: the tool that the direct child started most recently in its current run, from the tool's `activity` detail. Activity is cleared when a run starts and when the task stops.

A call that returns before its task finishes shows the fixed `↗ returned; task waits for capacity in background`, `↗ returned; task continues in background`, `↪ input queued for the running task`, or `↪ steered the running task`; use the panel or widget for live state.

### Task card details

Other labelled rows show the selection, usage, error, and task ID:

- `model`: the model and thinking level. Before the task reports, only an explicitly requested model or thinking level appears.
- `usage`: usage such as `↑48k ↓3.1k $0.21`, when a value is positive.
- `error`: the first line of a failure's error. Cancellation uses the warning colour, like other cancelled status details; the panel's `⊘` glyph uses the error colour, like pi-tool-display headings. See [notices and colours](../../pi-tool-display/docs/presentation.md#notices-and-colours).
- `task`: the first eight characters of the task ID; expansion shows the full ID.

Completed cards preview the first three reply lines, or all four when there are exactly four, after a blank row, with an expansion hint for the rest. A rejected call shows its error text in the same way. Long lines wrap, and labelled rows wrap under their values. When the label column would leave fewer than two columns for a value, labels appear above their values. Expansion adds `background` and `delivery` rows for non-default options, up to ten prompt lines, and retained output. The prompt preview uses at most 16,384 UTF-16 code units, without splitting graphemes or recognised terminal sequences.

A successful `subagent_abort` card uses the same layout with the aborted task's description, `⊘ aborted after` its time, and its usage; the call itself is not shown as failed.

### Job cards

A `job` card names the tool and the description on its first line. The `command` row shows the first line of the command; expansion shows up to ten lines. The command preview uses at most 16,384 UTF-16 code units, without splitting graphemes or recognised terminal sequences. The `status` row shows `↗ returned; job continues in background`, and the `job` row shows the first eight characters of the job ID. Expansion shows the full ID, a `log` row with the log file path, and the returned text.

A `job_abort` card names the job ID and shows `⊘ aborted after` the job's time, or `already completed` or `already failed` when the job exited first.

### Background result messages

Pi shows a delivered background result in its default message box, including the model-facing `<task>` or `<job>` envelope. [pi-tool-display](../../pi-tool-display/docs/tools.md#subagents) replaces these cards and the background result box in the main chat with its own subagent and job cards.

## Widget

The widget counts active tasks throughout the tree and the session's active jobs, such as `2 subagents · 1 job`; a zero count is left out. It alternates between `muted` and `dim` every 600 ms. It disappears when no tasks or jobs remain active.

Fullscreen clicks on the widget open the panel. Tool cards with a task ID open the corresponding viewer, and cards with a job ID open the job's log viewer.
