# pi-mono

[Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) extensions and shared libraries.

## Setup

Use the Node.js version in [.node-version](.node-version) and install the [Vite+ CLI (`vp`)](https://viteplus.dev/guide/). From the repository root, run:

```sh
vp install --frozen-lockfile
```

Extensions load directly from TypeScript; there is no build step.

## Load an extension

After setup, launch the workspace's Pi version with an extension directory:

```sh
vp exec pi -e ./packages/extensions/pi-tool-display
```

The extension appears in Pi's startup list. Repeat `-e` for each additional extension. This command does not save the extension selection. For loading across sessions, use Pi's [local package configuration](node_modules/@earendil-works/pi-coding-agent/docs/packages.md#local-paths).

## Extensions

- [pi-tool-display](packages/extensions/pi-tool-display/README.md): compact, borderless tool activity with expandable output and file diffs.
- [pi-fff-guard](packages/extensions/pi-fff-guard/README.md): block FFF searches targeting Git-ignored or missing explicit paths.
- [pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md): private prompt history and saved drafts, scoped to the working directory.
- [pi-todo](packages/extensions/pi-todo/README.md): session-backed tasks with progress widget and task browser.
- [pi-agent-summary](packages/extensions/pi-agent-summary/README.md): live elapsed runtime, bash-call counts, and file-change summaries kept outside model context.

## Development

To contribute, follow the [development setup and commands](docs/development.md). Use the [architecture guide](docs/architecture.md) to find package responsibilities and code.
