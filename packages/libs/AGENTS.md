# [@pi-mono/libs](README.md) development

## Code navigation

[Library contracts](README.md#usage) · [Supported imports](package.json)

For hook teardown changes, trace the display [installer](../extensions/pi-tool-display/src/host/install.ts) and [native registry](../extensions/pi-tool-display/src/host/native-registry.ts). They manage callback lifetime and restore definitions.

## Constraints

Keep each library's implementation, tests, and contract together. TUI modules belong under [`src/tui/`](src/tui/README.md), with reusable components under `src/tui/components/`. Other APIs use `src/<library>/`.

Keep feature records, capacities, diagnostics, session policy, and fixture scenarios in consumers.

## Validation

Use [package validation](README.md#validation). Browser and mounting coverage lives in [shared TUI](src/tui/README.md#validation), including host remounts and editor snapshot ordering. Extensions retain tests for domain actions and nonvisual SDK integration.
