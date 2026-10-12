# Subagent display adapter

[Adapter development](../../../docs/adapters.md)

The adapter recognises the `pi-subagents` registering package and the projected `subagent` parameter structure, or the `subagent_abort` structure with a required `task_id` string. Arguments and result details are validated separately, including queued calls with no task ID. It has no runtime dependency on pi-subagents. Without pi-tool-display, pi-subagents draws its own cards in Pi's tool box.

## Action ownership

Validated `task_id` and `binding_id` fields supply the `pi-subagents:open` action. The receiving host checks the current parent binding and task ownership; a matching logical ID alone cannot authorise an old card.

## Card layout

Cards put the description and a structured status on the first line. The adapter reports queued, running, completed, failed, cancelled, and returned states. The shared renderer adds elapsed time only when the adapter supplies a start time, and shows `preparing`, `waiting to run`, or `starting` before details exist.

The second line shows the explicitly requested `model:thinking` before details, then the resolved identity, with `Waiting for capacity` or usage such as `↑48k ↓3.1k $0.21`. Usage omits cache counts and appears only when a value is positive. A failed or cancelled call shows usage before its error text. Error line breaks become spaces before wrapping. Running activity is not shown.

A call that returned while its task keeps running shows a fixed `in background`, `steered`, or `input queued` status. Its task ID appears only when expanded.

## Abort cards

`subagent_abort` arguments are exactly `{ task_id }`. Successful calls return details with the same structure as `subagent` details and the aborted task's `cancelled` state. Their cards use the same layout: the task description, `⊘ aborted` with the task's elapsed time, the identity, and usage. Before details exist, the description is the task ID. The call itself succeeded, so the adapter reports no `cancelled` outcome and the card has no failure state. The result removes the task envelope, and a click opens the task with the same `pi-subagents:open` action.

## Results and expansion

Results show the child's reply without the model-facing [`<task>` envelope](../../../../../utils/src/task-envelope.ts) and its summary. The envelope is removed only when its task ID and state equal the validated details; other text is shown unchanged. Collapsed completed cards preview three reply lines, or all four when there are exactly four, under a `└` branch. Long lines end with `…`. Expanded cards show the task ID, non-default options, a ten-line prompt preview, and retained results.

## Background results

The adapter also renders the `pi-subagents.result` session message through Pi's public message-renderer API. It validates the message details with the same details schema as tool results. Valid results use the [card renderer](../../rendering/subagent-result.ts) with the standalone `subagent` card layout: the description, the final state and time, and the identity and usage. Completed results add a reply preview; failed or cancelled results show any recorded error. The matching task envelope is removed. Results have no prompt, and expansion adds the task ID, non-default options such as `background`, and retained output. A fullscreen click emits the same `pi-subagents:open` action. Invalid details keep Pi's default message box.

Without pi-tool-display, pi-subagents registers no message renderer, so Pi shows its default message box. Background results separate exploration groups and runs like other visible messages, and add no summary counts.

## Run summaries

Summary mode counts validated task IDs once per run under “ran {n} subagent(s)”, and aborted task IDs under “aborted {n} subagent(s)”. Calls without an ID count individually. Incompatible results fall back to generic cards and counts.

Check appearance and actions with the subagent terminal fixture in regular and fullscreen modes. Producer execution, ownership, and transport coverage belong to pi-subagents; display replay and provenance validation belong to pi-tool-display.
