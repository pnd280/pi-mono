# [pi-agent-summary](README.md) development

Time a run from the first `agent_start` to `agent_settled`, not to `turn_end` or a retryable `agent_end`.

## Must not regress

- Use `appendEntry`, never `sendMessage`, so summaries stay out of model context.
- Never save file contents or patches.
- Keep unavailable statistics distinct from zero changes.

## Constraints

- Measure throughput over assistant streaming, not run time.
- Output usage already includes reasoning.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Subscribe to shared [file-mutations](../../libs/src/file-mutations/README.md) for verified native `edit` and `write` operations.
- Don't reread targets, scan repositories, or infer changes from bash commands.
- Use [bounded-diff](../../libs/src/bounded-diff/README.md) for net comparisons.
- Clear live intervals on shutdown.

## Validation

For lifecycle or host changes, use the [Pi compatibility checklist](docs/pi-compatibility.md). For what to test where, see [testing](docs/testing.md).
