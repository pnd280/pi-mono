# [pi-subagents](README.md) development

Use only public Pi APIs and RPC; the one exception is the [late-usage](GLOSSARY.md#results) patch in [ADR 0002](docs/adr/0002-count-late-background-usage.md). Keep [task](GLOSSARY.md#tasks-and-processes) policy and process lifecycle in this package. The [glossary](GLOSSARY.md) defines the package's terms.

## Boundaries

- Do not use Pi's `RpcClient`: it cannot answer [child](GLOSSARY.md#tasks-and-processes) dialogs or stop process trees, and its environment merging breaks fixture isolation.
- `ChildRun` spawns Pi, owns the RPC connection and timers, and stops the process tree directly, without a transport port. See [ADR 0004](docs/adr/0004-no-child-transport-seam.md).
- Keep entry identifiers in `src/constants.ts`, shared by readers and writers.
- Preserve the [supervisor](GLOSSARY.md#tasks-and-processes)'s project-trust decision, and pass only the explicitly selected child arguments.
- Before changing when [background results](GLOSSARY.md#results) are delivered, read [ADR 0001](docs/adr/0001-hold-run-for-background-results.md), and for [jobs](GLOSSARY.md#tasks-and-processes), [ADR 0005](docs/adr/0005-background-jobs.md).
- Hold [capacity](GLOSSARY.md#tasks-and-processes) until a child exits, including during forced shutdown. Claim inactive tasks before waiting for capacity to prevent concurrent resumes.
- Claim a live connection before sending input; retry only when no prompt was sent.
- A task keeps one [child file](GLOSSARY.md#history). Only a child holding the task's [writer lease](GLOSSARY.md#history) writes it; readers keep it in memory and never repair it. See [ADR 0003](docs/adr/0003-keep-task-history-in-child-sessions.md).
- Runtime code must not import validation fixtures. Fixtures use the isolated shared Pi launcher and fixed offline scenarios.

## Validation

Follow the [testing coverage and manual checks](docs/testing.md). New invariants and tests require user approval under the workspace testing policy. Recheck public contracts with the [compatibility checklist](docs/pi-compatibility.md) and [installed Pi API references](../../../docs/pi-docs.md) when upgrading Pi.
