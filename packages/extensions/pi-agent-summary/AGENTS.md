# [pi-agent-summary](README.md) development

Run lifecycle and Pi registration live in [src/index.ts](src/index.ts). For stream-rate calculation use [src/throughput.ts](src/throughput.ts); for file observations and net changes use [src/changes.ts](src/changes.ts). The stored contract is [src/summary.ts](src/summary.ts).

## Constraints

- Use `appendEntry`, never `sendMessage`, so summaries stay outside model context.
- Time from the first `agent_start` to `agent_settled`, not `turn_end` or retryable `agent_end`.
- Measure throughput over assistant streaming, not run time; output usage already includes reasoning.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Subscribe to shared [file-mutations](../../libs/src/file-mutations/README.md) for verified native `edit` and `write` operations. Do not reread targets, scan repositories, or infer changes from bash commands.
- Use [bounded-diff](../../libs/src/bounded-diff/README.md) for net comparisons. Never persist contents or patches; distinguish unavailable statistics from zero changes.
- Clean up live intervals on shutdown.

## Validation

For lifecycle/host changes, use the [Pi compatibility checklist](docs/pi-compatibility.md); for coverage boundaries use [testing](docs/testing.md). Run [package validation](README.md#validation).
