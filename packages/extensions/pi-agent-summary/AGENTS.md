# [pi-agent-summary](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): Pi lifecycle and tool-event adapter, working-message registration, and custom entry persistence.
- [src/timer.ts](src/timer.ts): monotonic elapsed time and interval cleanup.
- [src/throughput.ts](src/throughput.ts): output-token and assistant streaming-time accumulation.
- [src/changes.ts](src/changes.ts): bounded source retention and net line counts.
- [src/summary.ts](src/summary.ts), [src/render.ts](src/render.ts): persisted entry schema and rendering.

## Constraints

- Use `appendEntry`, never `sendMessage`, so summaries stay outside model context.
- Time from the first `agent_start` to `agent_settled`, not `turn_end` or retryable `agent_end`.
- Measure throughput over assistant message streaming, not total run time; reported output already includes reasoning.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Subscribe to shared [file-mutations](../../libs/src/file-mutations/README.md) for verified native `edit` and `write` operations. Do not reread targets, scan repositories, or infer changes from bash commands.
- Use [bounded-diff](../../libs/src/bounded-diff/README.md) for net comparisons. Never persist contents or patches; distinguish unavailable statistics from zero changes.
- Use monotonic timing and clean up live intervals on shutdown.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation) and the [coverage specification](docs/testing.md); follow [workspace verification](../../../docs/agents/verification.md).
