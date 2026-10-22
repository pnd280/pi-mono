# [pi-smart-compact](README.md) development

Terms such as _fingerprint_ and _split turn_ are defined in the [compatibility guide](docs/pi-compatibility.md).

| When you change…                  | Start in                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Native compaction routing         | [src/native.ts](src/native.ts)                                                                     |
| Supported Pi versions             | [src/compatibility.ts](src/compatibility.ts) and the [upgrade checklist](docs/pi-compatibility.md) |
| Settings or summary-model routing | [src/config.ts](src/config.ts) and [src/summarize.ts](src/summarize.ts)                            |

## Must not regress

- Absent settings use native selection, and invalid settings never silently select another model. Never change the conversation model or send its credentials to the configured provider. See [configuration](README.md#configuration).
- Keep private API assumptions inside the compatibility boundary. Unknown versions and conflicting patches must fail closed. Never learn supported fingerprints from the running host.
- Scope requests and metadata to their session and native operation. Append metadata only after Pi's final abort check, and never overwrite another extension's replacement.
- Keep tool-batch persistence and ordinary continuation. Before the next response, append status only for skipped, cancelled, or failed attempts, and never to start another turn.

## Constraints

- Reuse Pi's native compaction orchestration. Do not call the aborting manual API, build compaction summaries or entries by hand, send user prompts, or invent continuation messages.
- Save a summary-model entry, hidden from the model, only for successful default summaries.
- Keep selected model and thinking information in result details for `pi-tool-display`, not in the acknowledgement the model reads.
- Apply instruction-file focus to every compaction route, whatever the model and thinking opt-ins say. Compose it once, before per-call focus, give hooks the same text, and keep Pi's default prompts.
- Register `context_window` in the extension factory, and again in `session_start` with the same exposure to add the configured docs. The [tools checklist](docs/pi-compatibility.md#tools) states the `--tools` behaviour and why a profile's choice of active tools still wins.
- At startup or reload, read only the selected instruction and docs files, and resolve relative paths in the settings scope that set them.

## Validation

Run the [package checks](../../../docs/development.md#focused-validation). They use offline provider fixtures. [Testing](docs/testing.md) covers behaviour and [compatibility](docs/pi-compatibility.md) covers host boundaries.
