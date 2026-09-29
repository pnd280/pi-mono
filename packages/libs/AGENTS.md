# [@pi-mono/libs](README.md) development

## Code navigation

[Library contracts](README.md#usage) · [Supported imports](package.json)

For hook teardown, trace [native-tools](src/native-tools/index.ts), [file-mutations](src/file-mutations/index.ts), and the display [installer](../extensions/pi-tool-display/src/host/install.ts).

## Constraints

Preserve remaining consumers' observations and deactivate disposed hook callbacks.

Keep feature records, capacities, diagnostics, session policy, and fixture scenarios in consumers.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation). Browser and mounting coverage lives in [shared TUI](src/tui/README.md#validation); extensions own domain and SDK integration checks.
