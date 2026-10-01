# [@pi-mono/libs](README.md) development

Keep feature records, capacities, diagnostics, session policy, and fixture scenarios in the consuming extensions.

## Code navigation

[Library contracts](README.md#usage) · [Supported imports](package.json)

| When you…                          | Read                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trace hook teardown                | [native-tools](src/native-tools/index.ts), [file-mutations](src/file-mutations/index.ts), and the display [installer](../extensions/pi-tool-display/src/host/install.ts) |
| Check browser or mounting coverage | [shared TUI validation](src/tui/README.md#validation)                                                                                                                    |
| Recheck Pi contracts on upgrade    | [compatibility checklist](docs/pi-compatibility.md)                                                                                                                      |

## Constraints

- When one consumer is disposed, keep the remaining consumers' observations and deactivate the disposed consumer's hook callbacks.

## Validation

Use [package validation](README.md#validation). Extensions own their domain and SDK integration checks.
