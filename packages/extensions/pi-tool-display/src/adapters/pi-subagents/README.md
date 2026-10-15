# pi-subagents adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Subagent tasks from [`pi-subagents`](../../../../pi-subagents/README.md) appear as progress cards with status, model, and usage, and background jobs appear as cards with the command and job ID. In fullscreen, a click opens the task or job. This page documents the adapter contract for its maintainers; if you use `pi-subagents`, read [Display](#display) for how its calls appear.

## Compatibility and selection

The adapter recognises the `pi-subagents` registering package and the projected `subagent` parameter structure, or the `subagent_abort` structure with a required `task_id` string. It recognises [job tools](#background-jobs) in the same way. Arguments and result details are validated separately, including queued calls with no task ID. It has no runtime dependency on pi-subagents. Without pi-tool-display, pi-subagents draws its own cards in Pi's tool box.

Validated `task_id` and `binding_id` fields supply the `pi-subagents:open` action. The receiving host checks the current parent binding and task ownership; a matching logical ID alone cannot authorise an old card.

## Display

Task, abort, and job cards use the shared [progress card](../../../docs/adapters.md#progress-cards-and-actions).

### Card layout

Cards put the description and a structured status on the first line. The adapter reports queued, running, completed, failed, cancelled, and returned states. The shared renderer adds elapsed time only when the adapter supplies a start time, and shows `preparing`, `waiting to run`, or `starting` before details exist.

The second line shows the explicitly requested `model:thinking` before details, then the resolved identity, with `Waiting for capacity` or usage such as `↑48k ↓3.1k $0.21`. Usage omits cache counts and appears only when a value is positive. A failed or cancelled call shows usage before its error text. Error line breaks become spaces before wrapping. Running activity is not shown.

A call that returned while its task keeps running shows a fixed `in background`, `steered`, or `input queued` status. Its task ID appears only when expanded.

### Abort cards

`subagent_abort` arguments are exactly `{ task_id }`. Successful calls return details with the same structure as `subagent` details and the aborted task's `cancelled` state. Their cards use the same layout: the task description, `⊘ aborted` with the task's elapsed time, the identity, and usage. Before details exist, the description is the task ID. The call itself succeeded, so the adapter reports no `cancelled` outcome and the card has no failure state. The result removes the task envelope, and a click opens the task with the same `pi-subagents:open` action.

### Results and expansion

Results show the child's reply without the model-facing [`<task>` envelope](../../../../../utils/src/task-envelope.ts) and its summary. The envelope is removed only when its task ID and state equal the validated details; other text is shown unchanged. Collapsed completed cards preview three reply lines, or all four when there are exactly four, under a `└` branch. Long lines end with `…`. Expanded cards show the task ID, non-default options, a ten-line prompt preview, and retained results.

## Background results

The adapter also renders the `pi-subagents.result` session message through Pi's public message-renderer API. It validates the message details with the same details schema as tool results. Valid results use the [card renderer](../../rendering/subagent-result.ts) with the standalone `subagent` card layout: the description, the final state and time, and the identity and usage. Completed results add a reply preview; failed or cancelled results show any recorded error. The matching task envelope is removed. Results have no prompt, and expansion adds the task ID, non-default options such as `background`, and retained output. A fullscreen click emits the same `pi-subagents:open` action. Invalid details keep Pi's default message box.

Without pi-tool-display, pi-subagents registers no message renderer, so Pi shows its default message box. Background results separate exploration groups and runs like other visible messages, and add no summary counts.

## Background jobs

[jobs.ts](jobs.ts) recognises `job` by the projected `command` and `description` strings, the `timeout` number, and the required `command` and `description`. It recognises `job_abort` by a required `job_id` string. Strict Zod schemas validate the arguments. A separate schema validates the job details: active details have `exit_code` and `ended_at` set to `null`, and inactive details have an `outcome` of `completed`, `failed`, or `cancelled`.

A `job` call returns at once. Its card shows the description, `↗ returned; job continues in background`, and then the command and the first eight characters of the job ID. Expansion shows the full job ID and the timeout, when the call sets one. The card does not show the later state of the job. If the job cannot start, the call has an error result without details, and the card is generic.

A `job_abort` card uses the layout of a `subagent_abort` card. Before details exist, the description is the job ID. After that, the card shows the job description, `⊘ aborted` with the job's run time, the command, and the exit code when it is known. If the command ended before the abort, the card shows the real outcome. The call itself succeeded, so the card has no failure state.

The `pi-subagents.job-result` message has a card with the outcome, the run time from `started_at` to `ended_at`, the command, the exit code, any recorded error, and the log path. A failed or cancelled job colours the card like a failed or cancelled call. Collapsed cards preview the first output lines. Expansion shows the job ID and the full retained output. Invalid details keep Pi's default message box.

Results and messages show the body without the [`<job>` envelope](../../../../../utils/src/task-envelope.ts). The envelope is removed only when its job ID, state, outcome, and exit code equal the validated details. Other text is shown unchanged. The display uses only the retained content and details. It never reads the log file.

A fullscreen click on a job card or job result emits `pi-subagents:open` with the validated `job_id` and `binding_id`. pi-subagents checks the binding and the job ownership.

## Summary mode

Summary mode counts validated task IDs once per run (`ran 1 subagent`, `ran 3 subagents`), and aborted task IDs separately (`aborted 1 subagent`). Calls without an ID count individually. Job and job abort calls have no summary category, so each call counts once under its tool name. Job results add no summary counts. Incompatible results fall back to generic cards and counts.

## Validation

Check appearance and actions, including job cards and job results, with the [subagent fixture rows of the terminal checks](../../../docs/validation.md#expansion-layout-and-diffs) in regular and fullscreen modes. Producer execution, ownership, and transport coverage belong to pi-subagents; display replay and provenance validation belong to pi-tool-display.
