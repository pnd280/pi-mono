# Continue and cancel tasks

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

A [task](../GLOSSARY.md#tasks-and-processes) keeps its ID for its whole life. The supervisor model uses that ID to send input to a running task, resume a finished task, or cancel a task whose result it no longer needs.

## Send input or resume

Set `task_id` in a `subagent` call to continue a task with its earlier conversation. An inactive task resumes; an active task receives input and returns immediately. IDs appear in tool results and `/subagents list`. Only the supervisor model sends task input.

- Use `delivery: "follow_up"` (the default) to add input after the current work, or `delivery: "steer"` to deliver it before the next model request.
- Active-task input uses the existing capacity slot and result destination, and reports no additional usage.
- When input continues a run after a final reply, the run's result contains that reply before the later replies.
- Active descendant input is routed to its supervisor. Only the supervisor that launched a task can resume it; inactive descendants are read-only.

A resume continues the task's latest run on the selected ancestry. For what the resumed run contains, see [resume](history.md#resume).

## Model and thinking

Omit `model` and `thinking` to use the supervisor's current selection for a new task. A model override uses `provider/id`; Pi resolves it and the provider validates availability.

The child resolves the model with the extensions that it loads itself; see [side effects](../README.md#side-effects). A [virtual model](https://pi.dev/docs/latest/virtual-models), or another model that an extension registers, is available to a child only when the child's settings load that extension. This also applies when the supervisor's current selection is a virtual model. A model from the supervisor's `-e` or from SDK code is not available: an unknown provider, such as `router/auto`, fails the launch, and an ID under a known provider, such as `openai-codex/auto`, can reach that provider as an unlisted model ID.

On resume, each omitted value repeats the value that the task's latest run requested, so later changes to the supervisor's selection do not apply. For example, a run that requested `high` on a model without thinking levels applies `off`, and a resume that selects a reasoning model requests `high` again.

Cards, the panel, and the board show the requested selection while a task is queued, the child's resolved model and clamped thinking level from launch, and then the physical model and thinking level of its latest response.

## Cancel a task

The model calls `subagent_abort` with a `task_id` when an active owned task's result is no longer necessary. This includes owned descendants.

A successful call returns a confirmation, and the model receives no separate `cancelled` result. An intermediate supervisor still receives the result of its own child. The task session remains resumable.

If the task finished before cancellation, the call reports an inactive task and preserves its actual result. If the task stops but the [forced stop](shutdown.md) of its processes or of a process in its subtree fails, the call reports that error instead of a confirmation, and the task's `cancelled` result also names the error. Descendant cancellation is confirmed by the owning supervisor; its errors reach the caller.

For how the child process then stops, see [process shutdown](shutdown.md).

## Task counter

With [pi-agent-summary](../../pi-agent-summary/README.md#counters), the run summary shows `delegated N tasks`. Each call that starts a task run, new or resumed, counts once; input to an active task, rejected calls, and queued calls cancelled before they start do not. Each descendant counts only in its own session.
