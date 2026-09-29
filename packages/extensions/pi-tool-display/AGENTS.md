# [pi-tool-display](README.md) development

## Code navigation

- **Host integration:** [host/install.ts](src/host/install.ts), [host/compatibility.ts](src/host/compatibility.ts), [host/native-registry.ts](src/host/native-registry.ts), and [host/row-layout.ts](src/host/row-layout.ts). For Pi upgrades start with the [compatibility checklist](docs/pi-compatibility.md).
- **Transcript and interpretation:** [interpretation.ts](src/interpretation.ts), [transcript/coordinator.ts](src/transcript/coordinator.ts), and [transcript/session.ts](src/transcript/session.ts); [CONTEXT.md](CONTEXT.md) names the concepts.
- **Presentation:** [rendering/cards.ts](src/rendering/cards.ts), [summary/](src/summary/), [host/assistant.ts](src/host/assistant.ts), and the [standalone API](docs/renderers.md).
- **Adapter and fixture work:** [adapter guidance](docs/adapters.md), [validation/workspace.ts](validation/workspace.ts), and [terminal scenarios](docs/validation.md).

## Constraints

Keep private Pi access under `host/`. Observe only verified native definitions in participating TUI sessions when specialized rendering is selected; preserve middleware, settings, active tools, results, mutation ordering, and other [native-tool](../../libs/src/native-tools/README.md) / [file-mutation](../../libs/src/file-mutations/README.md) consumers. Never register tools for presentation or recreate unknown closures. Restore only owned hooks/definitions, preserving later wrappers; disposed callbacks and pending events must not reattach old hooks.

Treat Pi arguments/results as borrowed and read-only. Adapter interpretation requires [verified provenance](docs/adapters.md#recognize-tool-contracts), not output-text guesses. Display lookup/renderers must not read files, execute tools, or persist data. Persist bounded facts and patches, not result bodies, images, or styled text. Replay must not reobserve files, rerun tools, or animate unknown results.

Keep grouped calls/notices in their Pi rows; compact diagnostics and images stay visible. Change row chrome only in `layoutRow`, which owns both rendering and click targets.

See [observation and saved history](README.md#observation-and-saved-history) for exclusions, side effects, and limits.

## Validation

Use [package validation](README.md#validation) and [terminal checks](docs/validation.md) for interaction changes. Before accepting Pi upgrade fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md) in both [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures.
