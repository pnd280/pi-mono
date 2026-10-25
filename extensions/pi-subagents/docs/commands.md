# Commands

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

The `/subagents` command lists, inspects, and controls tasks and [jobs](jobs.md). Commands produce one JSON notification outside model context. RPC clients send slash commands through `prompt`, including while the supervisor is working. Errors return `{ "error": "…" }`.

| Command                                                      | Result                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/subagents`                                                 | The [task panel](interface.md) in TUI mode; the first page elsewhere.                                                   |
| `/subagents list [--offset <n>] [--limit <n>]`               | A JSON page in depth-first launch order.                                                                                |
| `/subagents show <task_id> [--since <cursor>] [--limit <n>]` | A compact transcript digest with cumulative child usage.                                                                |
| `/subagents show <task_id> --last`                           | The text and entry cursor of the latest assistant message with content; both fields are `null` when absent.             |
| `/subagents abort <task_id>`                                 | Cancel an active task; its session remains resumable.                                                                   |
| `/subagents jobs [--offset <n>] [--limit <n>]`               | A JSON page of the jobs on the selected ancestry, in start order.                                                       |
| `/subagents show <job_id>`                                   | The job's state and the end of its log file.                                                                            |
| `/subagents abort <job_id>`                                  | Stop an active job; its `cancelled` result is delivered.                                                                |
| `/subagents background [task_id]`                            | Move foreground work to the background. Without an ID, move all direct foreground children of the top-level supervisor. |

## Task pages

List results contain `{ tasks, total, offset, next_offset }`. Offset defaults to 0; limit defaults to 20 and accepts 1 to 100. Follow `next_offset` until it is `null`. Each page fits 50 KiB and may contain fewer items than requested; an item too large to fit alone returns an error. Pages read the current list, so restart at offset 0 if it changes while paging.

The fields of a task item have different scopes:

- `usage` adds the usage of all the task's runs with known usage. It includes the usage of descendants that their results reported to the task. Do not add `usage` across all items, because descendants are then counted more than once. To get a total, add only the direct tasks; in a top-level supervisor, their `parent_task_id` is `null`.
- `run_id`, `description`, `model`, `thinking`, `requested_model`, `requested_thinking`, `background`, `started_at`, `ended_at`, `state`, `outcome`, and `error` describe the latest run on the selected ancestry. `state` is `active` or `inactive`, and `outcome` is `completed`, `failed`, `cancelled`, or `null` while active. `model` and `thinking` are the applied selection; `requested_model` and `requested_thinking` are the selection that the run requested, which a resume reuses for omitted values.
- `context` is the latest known context use, and `cache_hit` is the cache hit rate of the latest model request that had a prompt. They can come from an earlier run.

## Job pages

`jobs` pages contain `{ jobs, total, offset, next_offset }` and use the same rules. A job item has `job_id`, `description`, `command`, `state` (`active` or `inactive`), `outcome` (`completed`, `failed`, `cancelled`, or `null` while active), `exit_code`, `started_at`, `ended_at`, and `log_file`. `exit_code` is `null` after a timeout, a cancellation, or a start failure, and while the job is active.

`show <job_id>` returns `{ job_id, state, outcome, exit_code, log_file, text }`. `text` is the end of the log file, at most 2,000 log lines plus an `[Earlier output omitted]` line when needed. It also retains the `[Earlier output omitted: N bytes]` marker when the [log file's size limit](jobs.md#log-files) removed output. The text is short enough for the reply to fit 50 KiB, and is `null` when the log file cannot be read.

## Transcript digests

`show` returns user text, assistant text, and tool summaries on the child file's full ancestry of the selected run, including entries removed from model context by compaction or context edits. Thinking, tool arguments, and tool outputs are excluded.

A tool summary, such as `read ×2, bash ×1`, counts the calls of one assistant response by tool name. It appears at the result entry that completes the last of those calls, so a returned cursor never skips it. Calls that never receive a result have no summary.

- Without `--since`, the response contains the latest items and `omitted`, the count of earlier items.
- With `--since <cursor>`, it contains the first items after that entry and `more`, which indicates whether another page is available. Pass the returned `cursor` to read forward; an unknown cursor is an error.
- `--limit` is an integer from 1 to 100 and defaults to 20. Text items and tool summaries are cut at 2,000 bytes. Complete JSON pages fit 50 KiB and may contain fewer items than requested.
- `usage` covers the selected child ancestry, including reported descendant usage. Late background descendant usage is included when its result was delivered to that descendant's supervisor.
- `--last` returns `{ task_id, state, cursor, text }` from the active conversation, using the same text limits as the tool result. It follows Pi's active model context on the selected branch, and skips assistant messages without content, such as an empty error that Pi can add after an abort.

Reading a digest never modifies the child session. `session_file` from `list` is the task's child file. It can also contain runs that are not on the selected ancestry, and these are not shown.
