# Pi compatibility

[pi-agent-summary](../README.md)

## Contracts to verify

- [ ] [Lifecycle](../src/index.ts): first `agent_start` through `agent_settled`, including retries, queued follow-ups, cancellation, and timer cleanup; count direct and nested agent bash calls once per call ID, excluding manual shell input.
- [ ] [Run metadata](../src/index.ts): assistant `message_end` events name the answering `provider`, `model`, and requested `thinkingLevel`; under a virtual selection these are the routed physical model, while failed or aborted routing leaves `api: "pi-virtual"` (Pi's unexported `VIRTUAL_MODEL_API`) on the message. Error responses do not count. The [stored schema](../src/summary.ts) accepts all host thinking levels, absent levels, and absent model lists, but rejects empty lists and models without a provider.
- [ ] [Output throughput](../src/throughput.ts): public assistant `message_start`/`message_end` events delimit response streams; completed `message.usage.output` includes reasoning once. Verify cancelled/error usage, tool/nested-usage exclusion, continuation aggregation, and non-TUI reporting.
- [ ] [Mutation statistics](../src/changes.ts): verified native operations, ordering, path deduplication, net/reverted changes, and unavailable versus zero statistics.
- [ ] [Persistence/rendering](../src/index.ts): `appendEntry` stays outside model context; replay, expansion/mouse behavior, and non-TUI execution preserve metadata without contents or patches.

## Limitations and replacement opportunities

- [Output throughput](../README.md#output-throughput) is client-observed and depends on provider stream-start timing and reported usage. Prefer a public provider timing/throughput API if Pi adds one; do not estimate token counts from stream chunks.
- [Observation excludes bash changes, overrides, and custom tools](../README.md#tool-statistics). Revisit public mutation/run-summary APIs with trustworthy outcomes and ordering; retain bounded retention and context-free persistence. Shared observation changes belong in libs.

## Validation

Pi **0.99.2** package checks and offline tests passed. Real codemode and virtual-model coverage verifies one summary, nested Bash/file accounting, assistant-only throughput, routed physical-model identity, and context-free persistence. Shared mutation and display suites passed. Manual visual checks were not run.

Use [package and visual checks](../README.md#validation); check shared file-mutation consumers (`pi-tool-display`) and working-message composition with `pi-todo` when affected.
