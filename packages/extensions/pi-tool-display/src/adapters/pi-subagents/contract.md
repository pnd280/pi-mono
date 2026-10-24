# pi-subagents adapter contract

[pi-subagents adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change subagent or job handling. [Subagent cards](../../../docs/tools.md#subagents) describes what users see.

## Tasks and aborts

Task, abort, and job cards use the shared [progress card](../../../docs/adapters.md#progress-cards-and-actions).

- The adapter reports queued, running, completed, failed, cancelled, and returned states, and supplies a start time when one is known.
- `subagent_abort` arguments are exactly `{ task_id }`. Successful calls return details with the same structure as `subagent` details and the aborted task's `cancelled` state. The call itself succeeded, so the adapter reports no `cancelled` outcome.
- A click on an abort card emits the same `pi-subagents:open` action as a task card.
- The adapter removes the model-facing [`<task>` envelope](../../../../../utils/src/task-envelope.ts) only when its task ID and state equal the validated details. Other text is shown unchanged.

## Background results

The adapter also renders the `pi-subagents.result` session message through Pi's public message-renderer API. It validates the message details with the same details schema as tool results. Valid results use the [card renderer](../../rendering/subagent-result.ts) with the standalone `subagent` card layout, and a fullscreen click emits the same `pi-subagents:open` action. [Background results](../../../docs/tools.md#background-results) describes what users see.

Without pi-tool-display, pi-subagents registers no message renderer, so Pi shows its default message box.

## Background jobs

[jobs.ts](jobs.ts) recognises `job` by the projected `command` and `description` strings, the `timeout` number, the `hold_run` boolean, and the required `command` and `description`. It recognises `job_abort` by a required `job_id` string. Strict Zod schemas validate the arguments. A separate schema validates the job details: active details have `exit_code` and `ended_at` set to `null`, and inactive details have an `outcome` of `completed`, `failed`, or `cancelled`.

[Job cards](../../../docs/tools.md#job-cards) and [job results](../../../docs/tools.md#job-results) describe what users see. A job result card shows the run time from `started_at` to `ended_at`.

Results and messages show the body without the [`<job>` envelope](../../../../../utils/src/task-envelope.ts). The adapter removes the envelope only when its job ID, state, outcome, and exit code equal the validated details. Other text is shown unchanged. The display uses only the retained content and details. It never reads the log file.

A fullscreen click on a job card or job result emits `pi-subagents:open` with the validated `job_id` and `binding_id`. pi-subagents checks the binding and the job ownership.
