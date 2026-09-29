# pi-mono

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

## Setup

Use Node.js from [.node-version](.node-version) and the [Vite+ CLI (`vp`)](https://viteplus.dev/guide/). From the repository root:

```sh
vp install --frozen-lockfile
```

Extensions load TypeScript directly; no build is needed.

## Load an extension

Launch workspace Pi with an extension directory:

```sh
vp exec pi -e ./packages/extensions/pi-tool-display
```

Repeat `-e` for additional extensions. To persist the selection, use Pi's [package installation](node_modules/@earendil-works/pi-coding-agent/docs/packages.md#install-and-manage-packages).

## Extensions

- [pi-tool-display](packages/extensions/pi-tool-display/README.md): compact tool activity, expandable output, and file diffs.
- [pi-todo](packages/extensions/pi-todo/README.md): session-backed tasks, progress widget, and task browser.
- [pi-smart-compact](packages/extensions/pi-smart-compact/README.md): native compaction with task continuation.
- [pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md): directory-scoped prompt history and saved drafts.
- [pi-editor-widgets](packages/extensions/pi-editor-widgets/README.md): widget, status, and footer layouts.
- [pi-nested-instructions](packages/extensions/pi-nested-instructions/README.md): nested instruction discovery from tool inputs.
- [pi-session-utils](packages/extensions/pi-session-utils/README.md): session persistence, parent-linked sub-sessions, and naming.
- [pi-agent-summary](packages/extensions/pi-agent-summary/README.md): runtime, bash-call, and file-change summaries outside model context.
- [pi-fff-guard](packages/extensions/pi-fff-guard/README.md): guard FFF searches against ignored or missing paths.
- [pi-selective-read](packages/extensions/pi-selective-read/README.md): source-span highlighting in read context.
- [pi-model-prompt](packages/extensions/pi-model-prompt/README.md): model-specific append prompts.
- [pi-skills](packages/extensions/pi-skills/README.md): skill file references and inline completion.

## Development

See [development setup and commands](docs/development.md) and [package architecture](docs/architecture.md).
