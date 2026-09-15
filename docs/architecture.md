# Workspace architecture

[Workspace overview](../README.md)

Use [code organization and reuse](agents/architecture.md) to decide where code belongs and when to extract it. [vite.config.ts](../vite.config.ts) enforces import boundaries.

| Package                                                                 | Responsibility                            | Code navigation                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [pi-tool-display](../packages/extensions/pi-tool-display/README.md)     | Tool cards and exploration groups         | [Code navigation](../packages/extensions/pi-tool-display/AGENTS.md#code-navigation)            |
| [pi-fff-guard](../packages/extensions/pi-fff-guard/README.md)           | Block missing or Git-ignored FFF targets  | [Code navigation](../packages/extensions/pi-fff-guard/AGENTS.md#code-navigation)               |
| [pi-prompt-manager](../packages/extensions/pi-prompt-manager/README.md) | Directory-scoped history and saved drafts | [Code navigation](../packages/extensions/pi-prompt-manager/AGENTS.md#code-navigation)          |
| [@pi-mono/utils](../packages/utils/README.md)                           | Pure helpers                              | [Helpers](../packages/utils/README.md#usage)                                                   |
| [@pi-mono/libs](../packages/libs/README.md)                             | Shared APIs and TUI infrastructure        | [Libraries](../packages/libs/README.md#usage), [TUI](../packages/libs/src/tui/README.md#usage) |
