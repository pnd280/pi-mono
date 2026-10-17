# Workspace architecture

[Workspace overview](../README.md)

Pi provides the agent runtime, tool execution, sessions, and terminal UI. This workspace adds extensions that register tools, commands, event handlers, and presentation behaviour in that host.

## Package layers

| Area                                              | Responsibility                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`packages/extensions/`](../README.md#extensions) | Feature packages with their own Pi integration and domain policy.                                                          |
| [`packages/libs/`](../packages/libs/README.md)    | Shared stateful services, I/O, lifecycle coordination, and [TUI components and hosts](../packages/libs/src/tui/README.md). |
| [`packages/utils/`](../packages/utils/README.md)  | Pure parsing, formatting, and transformation helpers.                                                                      |

Extensions use libs and utils; libs can use utils. Neither shared package depends on extensions, and utils does not depend on libs. Package exports define supported import paths; [boundary checks](../vite.config.ts) enforce these dependency directions.

## Runtime integration

Pi loads an extension through its manifest's `pi.extensions` entry. The package-root `index.ts` forwards to the factory in `src/index.ts`; [tool display's entry point](../packages/extensions/pi-tool-display/src/index.ts) is one example. Lifecycle handlers connect package behaviour to the active session and release owned resources on shutdown.

Shared contracts connect features without transferring their domain policy. The package glossaries in the [glossary map](../GLOSSARY-MAP.md) define terms such as notices, counters, milestones, and tasks.

| Contract                                                                                               | Producer                                                                                                     | Consumer and responsibility                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Instruction notices](../packages/extensions/pi-nested-instructions/src/notices.ts)                    | `pi-nested-instructions` discovers instructions and publishes notices.                                       | `pi-tool-display` renders the notices; discovery and transcript presentation have separate owners.                                             |
| [Selective-read results](../packages/extensions/pi-read/src/result.ts)                                 | `pi-read` owns preview provenance and source-window interpretation.                                          | `pi-tool-display` uses the pure result contract for eligibility and source presentation.                                                       |
| [Todo text](../packages/extensions/pi-todo/src/text.ts)                                                | `pi-todo` owns the action and status vocabularies, subject shortening, status words, and progress summaries. | `pi-tool-display` validates todo arguments and details itself with those vocabularies and uses these rules for todo cards.                     |
| [File-mutation observations](../packages/libs/src/file-mutations/README.md)                            | The shared library observes native edit/write facts.                                                         | Tool display and agent summary consume those facts without separate file reads.                                                                |
| [Counters](../packages/extensions/pi-agent-summary/README.md#counters)                                 | `pi-subagents` and any other extension add to counters on a public event channel.                            | `pi-agent-summary` validates them and saves the counts with the active run's summary.                                                          |
| [Milestones](../packages/extensions/pi-agent-summary/README.md#milestones)                             | Any extension declares milestones on a public event channel.                                                 | `pi-agent-summary` validates them and saves them with the active run's summary.                                                                |
| [Working messages](../packages/libs/src/working-message/README.md)                                     | Todo activity, agent-summary timing, and the subagent background wait publish contributions.                 | The shared coordinator combines them on one host UI surface.                                                                                   |
| [Task details and actions](../packages/extensions/pi-tool-display/src/adapters/pi-subagents/README.md) | `pi-subagents` owns process lifetime and structured task and job results.                                    | `pi-tool-display` verifies and renders task and job cards and background results; action descriptors return to the owner for ownership checks. |

Reusable TUI components own layout and interaction; extensions supply data, domain policy, and action effects. Host mounting lives separately from components under `libs/src/tui/`.

| When you…                        | Read                                          |
| -------------------------------- | --------------------------------------------- |
| Use or configure a feature       | Its [package README](../README.md#extensions) |
| Change a Pi integration contract | [Installed API references](pi-docs.md)        |
| Set up or check the workspace    | [Development commands](development.md)        |
