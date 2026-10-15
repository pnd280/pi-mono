# pi-mono

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)

## Setup

Use Node.js from [.node-version](.node-version) and the [Vite+ CLI (`vp`)](https://viteplus.dev/guide/). From the repository root:

```sh
vp install --frozen-lockfile
```

Extensions load TypeScript directly, so there's no build step.

## Load an extension

Launch workspace Pi with an extension directory:

```sh
vp exec pi -e ./packages/extensions/pi-tool-display
```

Repeat `-e` to load more extensions. To keep extensions loaded across launches, use Pi's [package installation](https://pi.dev/docs/latest/packages#install-and-manage-packages).

Published Pi links point to the latest documentation, which may describe a newer version than this workspace uses. Maintainers can check the [installed API references](docs/pi-docs.md) for the pinned version.

## Extensions

| Extension                                                                      | What it does                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [pi-tool-display](packages/extensions/pi-tool-display/README.md)               | Shows tool calls as compact, expandable cards with file diffs, so long runs stay readable.            |
| [pi-todo](packages/extensions/pi-todo/README.md)                               | Gives the model a todo list, shown in a widget and a `/todos` browser and saved in the session.       |
| [pi-subagents](packages/extensions/pi-subagents/README.md)                     | Delegates foreground and background work to resumable Pi processes, with task views and cancellation. |
| [pi-smart-compact](packages/extensions/pi-smart-compact/README.md)             | Lets the model compact its own context mid-task, so long tasks keep going.                            |
| [pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md)           | Searchable history of your prompts and saved drafts, kept per directory.                              |
| [pi-editor-widgets](packages/extensions/pi-editor-widgets/README.md)           | Moves widgets and statuses above the editor, below it, or into the footer.                            |
| [pi-nested-instructions](packages/extensions/pi-nested-instructions/README.md) | Loads `AGENTS.md` files from subdirectories when the model starts working in them.                    |
| [pi-session-utils](packages/extensions/pi-session-utils/README.md)             | Saves unsaved sessions, starts empty child sessions, and names sessions automatically.                |
| [pi-agent-summary](packages/extensions/pi-agent-summary/README.md)             | Adds a one-line summary after each run: time, models, commands, and changed files.                    |
| [pi-fff-guard](packages/extensions/pi-fff-guard/README.md)                     | Stops FFF searches that would silently find nothing in ignored or missing paths.                      |
| [pi-read](packages/extensions/pi-read/README.md)                               | Lets the model select and highlight an exact span of a file when reading it.                          |
| [pi-model-prompt](packages/extensions/pi-model-prompt/README.md)               | Appends different system instructions depending on the model.                                         |
| [pi-skills](packages/extensions/pi-skills/README.md)                           | Turns `/skill:<name>` anywhere in a prompt into a file link, with **Tab** completion.                 |
| [pi-null-args](packages/extensions/pi-null-args/README.md)                     | Drops optional tool arguments that a model sent as the text `"null"`, so Pi doesn't reject the call.  |
| [pi-abort-guard](packages/extensions/pi-abort-guard/README.md)                 | Stops a running agent only on a second **Escape**, so one stray press doesn't end the turn.           |

## Development

See [development setup and commands](docs/development.md) and [package architecture](docs/architecture.md).
