# pi-smart-compact development

## Code navigation

- [src/index.ts](src/index.ts): tool schema and extension lifecycle binding.
- [src/native.ts](src/native.ts): session-scoped requests, entry-point/boundary patches, shared focus, summary-model persistence, and opt-in manual/automatic model routing.
- [src/compatibility.ts](src/compatibility.ts): inspected private contracts and API/CLI fingerprints.
- [src/config.ts](src/config.ts): global and trusted project settings, scope-relative instruction files, and startup/reload loading.
- [src/summarize.ts](src/summarize.ts): operation-scoped model, thinking, and instruction overrides.
- [src/instructions.ts](src/instructions.ts): native split-turn prompt focus.
- [src/entry.ts](src/entry.ts): context-free summary-model entry data and rendering.
- [src/outcome.ts](src/outcome.ts): native outcome observation, skip classification, and status text.
- [validation/](validation/): offline CLI provider, subprocess scenarios, and SDK lifecycle checks.

## Constraints

- Reuse Pi's native compaction orchestration. Do not call the aborting manual API, hand-build compaction summaries or compaction entries, or manufacture continuation messages.
- Preserve complete tool-batch persistence, native hooks/settings/retries, busy state, and ordinary loop continuation. Append status messages only for skipped, cancelled, or failed attempts, before the next response; success uses the native compaction entry and summary, preceded by a context-free summary-model entry for default summaries. Never use status messages to trigger another turn.
- Keep private API assumptions in the compatibility boundary. Unknown versions or conflicting patches must fail closed; never learn supported fingerprints from the executing host.
- Preserve [configuration rules](README.md#configuration): absent settings use native selection; invalid explicit settings must not silently select another model. Never change the conversation model/thinking or forward its credentials to the configured provider. Keep native retention settings and retry callbacks.
- Keep selected-model/thinking information in result details for `pi-tool-display`, not model-facing acknowledgement text.
- Scope requests and summary-model metadata to their session and native operation. Append metadata only at native persistence, after Pi's final abort check. Deactivate retained callbacks before restoring owned hooks. Do not overwrite another extension's replacement.
- Apply configured file focus to every compaction route independently of model/thinking opt-ins. Compose it once before per-call focus, expose the same text to hooks, and preserve native default prompts. Read only the winning instruction file at startup/reload, resolving relative paths in their original settings scope.
- Match the native split-turn instruction suffix, not phrases inside serialized conversation. Clone provider input rather than mutate retry-shared context.
- Follow [workspace development](../../../docs/development.md), [architecture](../../../docs/agents/architecture.md), and the [compatibility checklist](docs/pi-compatibility.md).

## Validation

Run the [package checks](README.md#validation). Follow the [testing specification](docs/testing.md) and [workspace verification workflow](../../../docs/agents/verification.md). Provider fixtures remain offline and use cleaned system-temp workspaces.
