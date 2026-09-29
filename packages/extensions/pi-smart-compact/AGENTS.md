# pi-smart-compact development

For native routing use [src/native.ts](src/native.ts); for host fingerprints use [src/compatibility.ts](src/compatibility.ts) and the [upgrade checklist](docs/pi-compatibility.md). Settings and request routing live in [src/config.ts](src/config.ts) and [src/summarize.ts](src/summarize.ts).

## Constraints

- Reuse Pi's native compaction orchestration. Do not call the aborting manual API, hand-build compaction summaries or compaction entries, or manufacture continuation messages.
- Preserve tool-batch persistence and ordinary continuation. Before the next response, append status only for skipped, cancelled, or failed attempts, never to trigger another turn. Persist a context-free summary-model entry only for successful default summaries.
- Keep private API assumptions in the compatibility boundary. Unknown versions or conflicting patches must fail closed; never learn supported fingerprints from the executing host.
- Absent settings use native selection; invalid settings must not silently select another model. Never change the conversation model or forward its credentials to the configured provider. See [configuration](README.md#configuration).
- Keep selected-model/thinking information in result details for `pi-tool-display`, not model-facing acknowledgement text.
- Scope requests and metadata to their session and native operation. Append metadata only after Pi's final abort check; do not overwrite another extension's replacement.
- Apply configured file focus to every compaction route independently of model and thinking opt-ins. Compose it once before per-call focus, expose the same text to hooks, and preserve native default prompts. At startup or reload, read only the selected instruction file and resolve relative paths in their original settings scope.
- Match the native split-turn instruction suffix, not phrases inside serialized conversation. Clone provider input rather than mutate retry-shared context.
- Follow the [compatibility checklist](docs/pi-compatibility.md) for Pi upgrades.

## Validation

Run [package validation](README.md#validation) with offline provider fixtures; [testing](docs/testing.md) and [compatibility](docs/pi-compatibility.md) cover distinct behavior and host boundaries.
