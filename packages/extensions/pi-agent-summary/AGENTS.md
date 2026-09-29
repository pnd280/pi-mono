# [pi-agent-summary](README.md) development

## Constraints

- Use `appendEntry`, never `sendMessage`, so summaries stay outside model context.
- Time from the first `agent_start` to `agent_settled`, not `turn_end` or retryable `agent_end`.
- Measure throughput over assistant streaming, not run time; output usage already includes reasoning.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Subscribe to shared [file-mutations](../../libs/src/file-mutations/README.md) for verified native `edit` and `write` operations. Do not reread targets, scan repositories, or infer changes from bash commands.
- Use [bounded-diff](../../libs/src/bounded-diff/README.md) for net comparisons. Never persist contents or patches; distinguish unavailable statistics from zero changes.
- Clean up live intervals on shutdown.

## Validation

For lifecycle/host changes, use the [Pi compatibility checklist](docs/pi-compatibility.md); for coverage boundaries use [testing](docs/testing.md).
