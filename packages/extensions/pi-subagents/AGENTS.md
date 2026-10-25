# [pi-subagents](README.md) development

Keep [task](GLOSSARY.md#tasks-and-processes) policy and process lifecycle in this package.

Use only public Pi APIs and RPC. The [late-usage](GLOSSARY.md#results) patch is the one exception; see [ADR 0002](docs/adr/0002-count-late-background-usage.md).

## Code navigation

| When you change…                                               | Read                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How Pi events, tools, and commands reach tasks                 | [index.ts](src/index.ts), then the [session binding](src/binding.ts)                                                                                                                                                        |
| The order of one run: slot, lease, spawn, entries, release     | [`Run`](src/tasks/run.ts) and the ADR 0003 [run lifecycle](docs/adr/0003-keep-task-history-in-child-sessions.md#run-lifecycle)                                                                                              |
| Task claims, records, launches, or resumes                     | [`Tasks`](src/tasks/registry.ts) and [records](src/tasks/records.ts)                                                                                                                                                        |
| Input, cancellation, or promotion, including for descendants   | [`Route`](src/tasks/route.ts)                                                                                                                                                                                               |
| Which descendants the task tree shows, and their order         | [`TaskTree`](src/tasks/tree.ts)                                                                                                                                                                                             |
| Capacity slots or messages between supervisors                 | [`Capacity`](src/tasks/capacity.ts), [`Relay`](src/coordination/relay.ts), and the [protocol](src/coordination/protocol.ts)                                                                                                 |
| Child spawn, RPC requests, or process-tree stops               | [`ChildRun`](src/child/run.ts), [`ChildConnection`](src/child/connection.ts), and [platform](src/child/platform.ts)                                                                                                         |
| Child-file reads, the writer lease, or resume points           | [`RunReader`](src/history/reader.ts), [`WriterLease`](src/history/lease.ts), and [sessions](src/history/sessions.ts)                                                                                                        |
| [Background result](GLOSSARY.md#results) content or late usage | [`ResultSource`](src/background-result.ts) and the [late-usage patch](src/late-usage.ts)                                                                                                                                    |
| When background results arrive                                 | [`Delivery`](src/delivery.ts), [ADR 0001](docs/adr/0001-hold-run-for-background-results.md), and [ADR 0006](docs/adr/0006-deliver-background-results-at-turn-end.md)                                                        |
| [Jobs](GLOSSARY.md#tasks-and-processes)                        | [Jobs](src/jobs/registry.ts), [tools](src/jobs/tool.ts), [ADR 0005](docs/adr/0005-background-jobs.md), [ADR 0007](docs/adr/0007-own-job-processes-and-bound-logs.md), [ADR 0008](docs/adr/0008-hold-run-for-marked-jobs.md) |
| Tool details, cards, or result text                            | [result](src/result.ts), [card renderers](src/tasks/render.ts), and the consumers under [Boundaries](#boundaries)                                                                                                           |
| The `subagent` guidance or a child's result instructions       | [tool](src/tasks/tool.ts) and the [child prompt](src/child/prompt.ts)                                                                                                                                                       |
| The task panel, viewers, or widget                             | [`Panels`](src/task-panel/panels.ts), [`TaskPanel`](src/task-panel/panel.ts), and the [widget](src/widget.ts)                                                                                                               |

## Boundaries

- Talk to [children](GLOSSARY.md#tasks-and-processes) through `ChildConnection`. Pi's `RpcClient` stays out: it cannot answer child dialogs or stop process trees, and its environment merging breaks fixture isolation.
- `ChildRun` spawns Pi, owns the RPC connection and timers, and stops the process tree directly, without a transport port. See [ADR 0004](docs/adr/0004-no-child-transport-seam.md).
- Keep entry identifiers in [constants](src/constants.ts), shared by readers and writers.
- [index.ts](src/index.ts) only maps Pi events, tools, and commands to the [session binding](GLOSSARY.md#tasks-and-processes). Tools, commands, and views get the current tasks and jobs from the binding at each use and keep no reference.
- Register the tools and the open-event listener in the extension factory. A later registration sets only the session's docs, delivery text, and `hidden` or `model-only` exposure, and runs only when one of them changed since the last registration. The [registration contracts](docs/pi-compatibility.md#extension-ui-and-registration) give the `--tools` reasons.
- Add a child's [result instructions](docs/children.md#result-instructions) only through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `300`, which keeps the text that Pi and earlier handlers append. Never force `systemPrompt`.
- Claim the panel shortcut through the lifecycle startup arrival ([shortcut claims](../../libs/src/lifecycle/phases.md#shortcut-claims)), not `registerShortcut`.
- Stop new work in the lifecycle shutdown revoke, through `SessionBinding.revoke`, and stop processes only in its cleanup. The revoke runs before any workspace extension's shutdown handler awaits, so only an extension from outside the workspace can await before it; see the [shutdown phase](../../libs/src/lifecycle/phases.md#shutdown-phase).
- Preserve the [supervisor](GLOSSARY.md#tasks-and-processes)'s project-trust decision, and pass only the explicitly selected child arguments.
- Hold [capacity](GLOSSARY.md#tasks-and-processes) until a child exits, including during forced shutdown. After a forced stop, also hold it until the child's process group is gone or the failure is reported. Claim inactive tasks before waiting for capacity to prevent concurrent resumes.
- Claim a live connection before sending input; retry only when no prompt was sent.
- A task keeps one [child file](GLOSSARY.md#history), and only a child holding the task's [writer lease](GLOSSARY.md#history) writes it.
- Readers keep the child file in memory and never repair it. See [ADR 0003](docs/adr/0003-keep-task-history-in-child-sessions.md).
- Runtime code must not import validation fixtures. Fixtures use the isolated shared Pi launcher and fixed offline scenarios.
- The [tool-display adapter](../pi-tool-display/src/adapters/pi-subagents/README.md) validates tool details and job results, and both packages use the [task envelope](../../utils/src/task-envelope.ts) for result text. When you change these formats, update and test the adapter in the same change.

## Validation

| When you…                                                 | Read                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change tests, fixtures, or invariants                     | [Test coverage](docs/testing.md) and [test fixtures](validation/README.md). A new invariant or test needs user approval under the [testing policy](../../../docs/agents/testing.md#coverage). |
| Change terminal behaviour                                 | [Manual checks](docs/validation.md)                                                                                                                                                           |
| Change RPC requests, child-file reads, or session changes | [Installed Pi API references](../../../docs/agents/pi-docs.md)                                                                                                                                |
| Upgrade Pi                                                | [Compatibility checklist](docs/pi-compatibility.md)                                                                                                                                           |
