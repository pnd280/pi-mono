# [@pi-mono/libs](README.md) development

## Code navigation

[Library contracts](README.md#usage) · [Supported imports](package.json)

For hook teardown changes, trace [native-tools](src/native-tools/README.md), [file-mutations](src/file-mutations/README.md), and the display [installer](../extensions/pi-tool-display/src/host/install.ts).

## Constraints

Preserve remaining consumers' observations and deactivate disposed hook callbacks.

Colocate implementation, tests, and contracts under `src/<library>/`, [`src/tui/`](src/tui/README.md) for TUI, and `src/tui/components/` for reusable components.

Keep feature records, capacities, diagnostics, session policy, and fixture scenarios in consumers.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation). Browser and mounting coverage lives in [shared TUI](src/tui/README.md#validation), including host remounts and editor snapshot ordering. Extensions retain tests for domain actions and nonvisual SDK integration.
