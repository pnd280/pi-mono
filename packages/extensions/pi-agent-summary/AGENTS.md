# [pi-agent-summary](README.md) development

Time a [run](GLOSSARY.md) from the first `agent_start` to `agent_settled`, not to `turn_end` or a retryable `agent_end`. Use the [lifecycle run marks](../../libs/src/lifecycle/README.md#run-marks), not a clock reading in the handler, so that slow handlers of other extensions do not change the duration.

## Must not regress

- Use `appendEntry`, never `sendMessage`, so [summaries](GLOSSARY.md) stay out of model context.
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
- Stop the run, the timer, and the file observers in the lifecycle shutdown revoke. After it, only a new `session_start` binds again, so a late `agent_start` cannot reconnect the observers.
- Accept [milestones and counters](GLOSSARY.md) only through their public channels, checked against the saved schema's limits, so saved summaries stay renderable.

## Validation

For lifecycle or host changes, use the [Pi compatibility checklist](docs/pi-compatibility.md). For what to test where, see [testing](docs/testing.md).
