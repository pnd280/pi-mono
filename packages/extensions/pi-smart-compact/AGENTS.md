# pi-smart-compact development

## Code navigation

- [src/index.ts](src/index.ts): tool schema and extension lifecycle binding.
- [src/native.ts](src/native.ts): session-scoped native compaction hooks and routing.
- [src/compatibility.ts](src/compatibility.ts): inspected private contracts and API/CLI fingerprints.
- [src/config.ts](src/config.ts), [src/summarize.ts](src/summarize.ts), [src/instructions.ts](src/instructions.ts): settings, scoped overrides, and split-turn focus.
- [src/status.ts](src/status.ts), [src/entry.ts](src/entry.ts), [src/outcome.ts](src/outcome.ts): footer status, summary-model entries, and outcomes.
- [validation/](validation/): offline CLI provider, subprocess scenarios, and SDK lifecycle checks.

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

Use [package validation](README.md#validation), the [testing specification](docs/testing.md), and [workspace verification](../../../docs/agents/verification.md). Provider fixtures remain offline.
