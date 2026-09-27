# Pi compatibility

[pi-agent-summary](../README.md)

## Contracts to verify

- [ ] [Lifecycle](../src/index.ts): first `agent_start` through `agent_settled`, including retries, queued follow-ups, cancellation, and timer cleanup; count agent bash calls only.
- [ ] [Run metadata](../src/index.ts): `ctx.model.provider`, `ctx.model.id`, and `pi.getThinkingLevel()` capture the first-start selection; later starts do not replace or backfill it. The [stored schema](../src/summary.ts) accepts all host thinking levels and absent model metadata, but rejects model metadata without a provider.
- [ ] [Mutation statistics](../src/changes.ts): verified native operations, ordering, path deduplication, net/reverted changes, and unavailable versus zero statistics.
- [ ] [Persistence/rendering](../src/index.ts): `appendEntry` stays outside model context; replay, expansion/mouse behavior, and non-TUI execution preserve metadata without contents or patches.

## Limitations and replacement opportunities

- [Observation excludes bash changes, overrides, and custom tools](../README.md#file-changes). Revisit public mutation/run-summary APIs with trustworthy outcomes and ordering; retain bounded retention and context-free persistence. Shared observation changes belong in libs.

## Validation

Use [package and visual checks](../README.md#validation); check shared file-mutation consumers (`pi-tool-display`) and working-message composition with `pi-todo` when affected.
