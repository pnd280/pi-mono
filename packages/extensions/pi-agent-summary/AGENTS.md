# [pi-agent-summary](README.md) development

Time a [run](GLOSSARY.md) from the first `agent_start` to `agent_settled`, not to `turn_end` or a retryable `agent_end`.

## Must not regress

- Use `appendEntry`, never `sendMessage`, so [summaries](GLOSSARY.md) stay out of model context.
- Never save file contents or patches.

## Constraints

- Measure throughput over assistant streaming, not run time.
- Publish live text through the shared [working-message coordinator](../../libs/src/working-message/README.md).
- Accept [milestones and counters](GLOSSARY.md) only through their [public channels](docs/milestones-and-counters.md), checked against the saved schema's limits, so saved summaries stay renderable.

## Validation

| When you…                    | Read                                                   |
| ---------------------------- | ------------------------------------------------------ |
| Change lifecycle or host use | [Pi compatibility checklist](docs/pi-compatibility.md) |
