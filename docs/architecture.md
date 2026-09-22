# Workspace architecture

[Workspace overview](../README.md)

Follow [code organization and reuse](agents/architecture.md) for placement and extraction. [vite.config.ts](../vite.config.ts) enforces import boundaries.

| Package                                                                 | Responsibility                                 | Code navigation                                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [pi-tool-display](../packages/extensions/pi-tool-display/README.md)     | Tool cards and exploration groups              | [Code navigation](../packages/extensions/pi-tool-display/AGENTS.md#code-navigation)            |
| [pi-fff-guard](../packages/extensions/pi-fff-guard/README.md)           | Block missing or Git-ignored FFF targets       | [Code navigation](../packages/extensions/pi-fff-guard/AGENTS.md#code-navigation)               |
| [pi-selective-read](../packages/extensions/pi-selective-read/README.md) | Source-span highlighting and read previews     | [Code navigation](../packages/extensions/pi-selective-read/AGENTS.md#code-navigation)          |
| [pi-prompt-manager](../packages/extensions/pi-prompt-manager/README.md) | Directory-scoped history and saved drafts      | [Code navigation](../packages/extensions/pi-prompt-manager/AGENTS.md#code-navigation)          |
| [pi-skills](../packages/extensions/pi-skills/README.md)                 | Literal skill references and inline completion | [Code navigation](../packages/extensions/pi-skills/AGENTS.md#code-navigation)                  |
| [pi-todo](../packages/extensions/pi-todo/README.md)                     | Session-backed tasks, widget, and browser      | [Code navigation](../packages/extensions/pi-todo/AGENTS.md#code-navigation)                    |
| [pi-agent-summary](../packages/extensions/pi-agent-summary/README.md)   | Agent runtime, bash calls, and file changes    | [Code navigation](../packages/extensions/pi-agent-summary/AGENTS.md#code-navigation)           |
| [pi-session-title](../packages/extensions/pi-session-title/README.md)   | Automatic naming and title regeneration        | [Code navigation](../packages/extensions/pi-session-title/AGENTS.md#code-navigation)           |
| [@pi-mono/utils](../packages/utils/README.md)                           | Pure helpers                                   | [Helpers](../packages/utils/README.md#usage)                                                   |
| [@pi-mono/libs](../packages/libs/README.md)                             | Shared APIs and TUI infrastructure             | [Libraries](../packages/libs/README.md#usage), [TUI](../packages/libs/src/tui/README.md#usage) |
