# [@pi-mono/libs](README.md) development

Keep feature records, capacities, diagnostics, session policy, rank reasons, and fixture scenarios in the consuming extensions.

## Code navigation

| When you…                     | Read                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pick a library or entry point | [library index](README.md#usage) and [supported imports](package.json)                                                                                                   |
| Trace hook teardown           | [native-tools](src/native-tools/index.ts), [file-mutations](src/file-mutations/index.ts), and the display [installer](../extensions/pi-tool-display/src/host/install.ts) |
| Upgrade Pi                    | [compatibility checklist](docs/pi-compatibility.md)                                                                                                                      |

## Constraints

- When one consumer is disposed, keep the remaining consumers' observations and deactivate the disposed consumer's hook callbacks. The [native-tools disposal rules](src/native-tools/README.md#wrappers-and-disposal) describe the result for callers.
- When you change a coordinator's shared state, increase its protocol version. The [version-mismatch rules](src/coordination/README.md#version-mismatch) explain how participants of different versions behave.
