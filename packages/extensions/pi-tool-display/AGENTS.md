# [pi-tool-display](README.md) development

For ownership and terminology, see [CONTEXT.md](CONTEXT.md). For adapter changes, follow [adapter guidance](docs/adapters.md); for interaction changes, use the [terminal checks](docs/validation.md).

Before accepting Pi upgrade fingerprints, follow the [compatibility checklist](docs/pi-compatibility.md) in both [API](src/host/install.test.ts) and [installed-CLI](src/host/install-cli.test.ts) fixtures.

## Constraints

Keep private Pi access under `host/`. Observe only verified native definitions in participating TUI sessions when specialized rendering is selected; preserve middleware, settings, active tools, results, mutation ordering, and other [native-tool](../../libs/src/native-tools/README.md) / [file-mutation](../../libs/src/file-mutations/README.md) consumers. Never register tools for presentation or recreate unknown closures. Restore only owned hooks/definitions, preserving later wrappers; disposed callbacks and pending events must not reattach old hooks.

Treat Pi arguments/results as borrowed and read-only. Adapter interpretation requires [verified provenance](docs/adapters.md#recognize-tool-contracts), not output-text guesses. Display lookup/renderers must not read files, execute tools, or persist data. Persist bounded facts and patches, not result bodies, images, or styled text. Replay must not reobserve files, rerun tools, or animate unknown results.

Keep grouped calls/notices in their Pi rows; compact diagnostics and images stay visible. Change row chrome only in `layoutRow`, which owns both rendering and click targets.

See [observation and saved history](README.md#observation-and-saved-history) for exclusions, side effects, and limits.
