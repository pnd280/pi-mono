# Workspace architecture

[Workspace overview](../README.md)

Pi provides the agent runtime, tool execution, sessions, and terminal UI. This workspace adds extensions that register tools, commands, event handlers, and presentation behavior in that host.

## Package layers

| Area                                              | Responsibility                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`packages/extensions/`](../README.md#extensions) | Feature packages with their own Pi integration and domain policy.                                                          |
| [`packages/libs/`](../packages/libs/README.md)    | Shared stateful services, I/O, lifecycle coordination, and [TUI components and hosts](../packages/libs/src/tui/README.md). |
| [`packages/utils/`](../packages/utils/README.md)  | Pure parsing, formatting, and transformation helpers.                                                                      |

Extensions use libs and utils; libs can use utils. Neither shared package depends on extensions, and utils does not depend on libs. Package exports define supported import paths; [boundary checks](../vite.config.ts) enforce these dependency directions.

## Runtime integration

Pi loads an extension through its manifest's `pi.extensions` entry. The package-root `index.ts` forwards to the factory in `src/index.ts`; [tool display's entry point](../packages/extensions/pi-tool-display/src/index.ts) is one example. Lifecycle handlers connect package behavior to the active session and release owned resources on shutdown.

Features compose through focused contracts and shared services:

- **Instruction content and presentation:** `pi-nested-instructions` publishes a [notice contract](../packages/extensions/pi-nested-instructions/src/notices.ts); `pi-tool-display` renders those messages. Discovery and transcript presentation have separate owners.
- **File observations:** tool display and agent summary consume shared [file-mutation observations](../packages/libs/src/file-mutations/README.md), allowing both to use native edit/write facts without separate file reads.
- **Activity display:** todo activity and agent-summary timing publish through the [working-message coordinator](../packages/libs/src/working-message/README.md), which combines contributions to one host UI surface.

Reusable TUI components own layout and interaction; extensions supply data, domain policy, and action effects. Host mounting lives separately from components under `libs/src/tui/`.

For a feature's behavior and configuration, start with its [package README](../README.md#extensions). For Pi integration contracts, use the [installed API references](pi-docs.md); for development commands, see [development](development.md).
