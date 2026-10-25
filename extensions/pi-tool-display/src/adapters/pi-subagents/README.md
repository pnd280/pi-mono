# pi-subagents adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

Subagent tasks from [`pi-subagents`](../../../../pi-subagents/README.md) appear as progress cards with status, model, and usage, and background jobs appear as cards with the command and job ID. In fullscreen, a click opens the task or job. See [subagent cards](../../../docs/tools.md#subagents).

## Compatibility and selection

The adapter recognises the `pi-subagents` registering package and the projected `subagent` parameter structure, or the `subagent_abort` structure with a required `task_id` string. It recognises [job tools](contract.md#background-jobs) in the same way. Arguments and result details are validated separately, including queued calls with no task ID. From pi-subagents, this extension imports only the result message identifiers and the open-action event name in the pure `pi-subagents/constants` module, never its extension factory. Without pi-tool-display, pi-subagents draws its own cards in Pi's tool box.

Validated `task_id` and `binding_id` fields supply the `pi-subagents:open` action. The receiving host checks the current parent binding and task ownership; a matching logical ID alone cannot authorise an old card.

The adapter also renders the `pi-subagents.result` and `pi-subagents.job-result` session messages, which the extension entry point registers. The [adapter contract](contract.md) covers task, abort, and job details, [background results](contract.md#background-results), and [background jobs](contract.md#background-jobs).

## Validation

Check appearance and actions, including job cards and job results, with the [subagent fixture rows of the terminal checks](../../../docs/validation.md#subagent-cards) in regular and fullscreen modes. Producer execution, ownership, and transport coverage belong to pi-subagents; display replay and provenance validation belong to pi-tool-display.
