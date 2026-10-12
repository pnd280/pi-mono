# Keep the child process without a transport seam

[pi-subagents](../../README.md#validation)

`ChildRun` spawns Pi, owns the RPC connection, sets its own timers, and stops the process tree directly. An architecture review proposed a port with two adapters: the Pi process for production and a scripted in-memory child for tests, so that lifecycle races could run in process.

## Decision

`ChildRun` keeps its process, transport, and clock effects. There is no port.

The [workspace testing policy](../../../../../docs/agents/testing.md#layers) keeps lifecycle invariants in e2e tests on real Pi, and it permits unit tests only for pure security or data-integrity functions. A scripted child would therefore have no consumer. With only the production adapter, the port would add indirection, but no real seam.

## Consequences

- Race tests hold their windows with spies on `ChildRun.prototype`, `WriterLease.prototype`, and `Tasks.prototype.subscribe`, the event seam that delivery reads. They check public outcomes: tool results, `/subagents list`, and saved entries.
- Pi's `RpcClient` stays excluded as an adapter; see [AGENTS.md](../../AGENTS.md#boundaries).
- Reopen this decision if the workspace policy permits in-process lifecycle tests, or if a second child transport becomes necessary.
