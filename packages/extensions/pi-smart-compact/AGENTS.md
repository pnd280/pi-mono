# pi-smart-compact development

## Code navigation

- [src/index.ts](src/index.ts): tool schema and extension lifecycle binding.
- [src/native.ts](src/native.ts): session-scoped requests and the between-response boundary patch.
- [src/compatibility.ts](src/compatibility.ts): inspected private contracts and API/CLI fingerprints.
- [src/instructions.ts](src/instructions.ts): temporary instruction plumbing and native split-turn prompt focus.
- [src/outcome.ts](src/outcome.ts): native outcome observation, skip classification, and status text.
- [validation/](validation/): offline CLI provider, subprocess scenarios, and SDK lifecycle checks.

## Constraints

- Reuse Pi's native compaction orchestration. Do not call the aborting manual API, hand-build summaries/entries, or manufacture continuation messages.
- Preserve complete tool-batch persistence, native hooks/settings/retries, busy state, and ordinary loop continuation. Append status messages only for skipped, cancelled, or failed attempts, before the next response; success uses the native compaction entry and summary. Never use status messages to trigger another turn.
- Keep private API assumptions in the compatibility boundary. Unknown versions or conflicting patches must fail closed; never learn supported fingerprints from the executing host.
- Scope requests to their session and instructions to the native operation. Deactivate retained callbacks before restoring owned hooks. Do not overwrite another extension's replacement.
- Match the native split-turn instruction suffix, not phrases inside serialized conversation. Clone provider input rather than mutate retry-shared context.
- Follow [workspace development](../../../docs/development.md), [architecture](../../../docs/agents/architecture.md), and the [compatibility checklist](docs/pi-compatibility.md).

## Validation

Run the [package checks](README.md#validation). Follow the [testing specification](docs/testing.md) and [workspace verification workflow](../../../docs/agents/verification.md). Provider fixtures remain offline and use cleaned system-temp workspaces.
