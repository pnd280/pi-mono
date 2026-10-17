# [pi-subagents](README.md) development

Use only public Pi APIs and RPC; the one exception is the [late-usage](GLOSSARY.md#results) patch in [ADR 0002](docs/adr/0002-count-late-background-usage.md). Keep [task](GLOSSARY.md#tasks-and-processes) policy and process lifecycle in this package. The [glossary](GLOSSARY.md) defines the package's terms.

## Code navigation

| When you change…                                             | Read                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| How Pi events, tools, and commands reach tasks               | [index.ts](src/index.ts), then the [session binding](src/binding.ts)                                                           |
| The order of one run: slot, lease, spawn, entries, release   | [`Run`](src/tasks/run.ts) and the ADR 0003 [run lifecycle](docs/adr/0003-keep-task-history-in-child-sessions.md#run-lifecycle) |
| Task claims, records, launches, or resumes                   | [`Tasks`](src/tasks/registry.ts) and [records](src/tasks/records.ts)                                                           |
| Input, cancellation, or promotion, including for descendants | [`Route`](src/tasks/route.ts)                                                                                                  |
| Which descendants the task tree shows, and their order       | [`TaskTree`](src/tasks/tree.ts)                                                                                                |
| Capacity slots or messages between supervisors               | [`Capacity`](src/tasks/capacity.ts), [`Relay`](src/coordination/relay.ts), and the [protocol](src/coordination/protocol.ts)    |
| Child spawn, RPC requests, or process-tree stops             | [`ChildRun`](src/child/run.ts), [`ChildConnection`](src/child/connection.ts), and [platform](src/child/platform.ts)            |
| Child-file reads, the writer lease, or resume points         | [`RunReader`](src/history/reader.ts), [`WriterLease`](src/history/lease.ts), and [sessions](src/history/sessions.ts)           |
| Background result content or late usage                      | [`ResultSource`](src/background-result.ts) and the [late-usage patch](src/late-usage.ts)                                       |
| When background results arrive                               | [`Delivery`](src/delivery.ts) and the delivery ADRs under [Boundaries](#boundaries)                                            |
| Jobs                                                         | [`Jobs`](src/jobs/registry.ts) and the [job tools](src/jobs/tool.ts)                                                           |
| Tool details, cards, or result text                          | [result](src/result.ts), [card renderers](src/tasks/render.ts), and the consumers under [Boundaries](#boundaries)              |
| The task panel, viewers, or widget                           | [`Panels`](src/task-panel/panels.ts), [`TaskPanel`](src/task-panel/panel.ts), and the [widget](src/widget.ts)                  |
| Tests or fixtures                                            | [Test fixtures](validation/README.md)                                                                                          |

## Boundaries

- Do not use Pi's `RpcClient`: it cannot answer [child](GLOSSARY.md#tasks-and-processes) dialogs or stop process trees, and its environment merging breaks fixture isolation.
- `ChildRun` spawns Pi, owns the RPC connection and timers, and stops the process tree directly, without a transport port. See [ADR 0004](docs/adr/0004-no-child-transport-seam.md).
- Keep entry identifiers in [constants](src/constants.ts), shared by readers and writers.
- [index.ts](src/index.ts) only maps Pi events, tools, and commands to the [session binding](GLOSSARY.md#tasks-and-processes) in [binding.ts](src/binding.ts). Tools, commands, and views get the current tasks and jobs from the binding at each use; they do not keep them.
- Preserve the [supervisor](GLOSSARY.md#tasks-and-processes)'s project-trust decision, and pass only the explicitly selected child arguments.
- Before changing when [background results](GLOSSARY.md#results) are delivered, read [ADR 0001](docs/adr/0001-hold-run-for-background-results.md) and [ADR 0006](docs/adr/0006-deliver-background-results-at-turn-end.md), and for [jobs](GLOSSARY.md#tasks-and-processes), [ADR 0005](docs/adr/0005-background-jobs.md).
- Hold [capacity](GLOSSARY.md#tasks-and-processes) until a child exits, including during forced shutdown. After a forced stop, also hold it until the child's process group is gone or the failure is reported. Claim inactive tasks before waiting for capacity to prevent concurrent resumes.
- Claim a live connection before sending input; retry only when no prompt was sent.
- A task keeps one [child file](GLOSSARY.md#history). Only a child holding the task's [writer lease](GLOSSARY.md#history) writes it; readers keep it in memory and never repair it. See [ADR 0003](docs/adr/0003-keep-task-history-in-child-sessions.md).
- Runtime code must not import validation fixtures. Fixtures use the isolated shared Pi launcher and fixed offline scenarios.
- The [tool-display adapter](../pi-tool-display/src/adapters/pi-subagents/README.md) validates tool details and job results, and both packages use the [task envelope](../../utils/src/task-envelope.ts) for result text. When you change these formats, update and test the adapter in the same change.

## Validation

Follow the [testing coverage](docs/testing.md). New invariants and tests require user approval under the workspace testing policy. For terminal behaviour, use the [manual checks](docs/validation.md).

When you change RPC requests, child-file reads, or session-change handling, read the [installed Pi API references](../../../docs/pi-docs.md). When you upgrade Pi, recheck public contracts with the [compatibility checklist](docs/pi-compatibility.md).
