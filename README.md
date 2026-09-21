# pi-mono

Extensions for the [Pi coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

## Setup

Use Node.js from [.node-version](.node-version) and the [Vite+ CLI (`vp`)](https://viteplus.dev/guide/). From the repository root:

```sh
vp install --frozen-lockfile
```

Extensions load TypeScript directly; no build is needed.

## Load an extension

After setup, launch workspace Pi with an extension directory:

```sh
vp exec pi -e ./packages/extensions/pi-tool-display
```

Repeat `-e` for additional extensions. To persist the selection, use Pi's [local package configuration](node_modules/@earendil-works/pi-coding-agent/docs/packages.md#local-paths).

## Extensions

- [pi-tool-display](packages/extensions/pi-tool-display/README.md): compact, borderless tool activity with expandable output and file diffs.
- [pi-fff-guard](packages/extensions/pi-fff-guard/README.md): block FFF searches targeting Git-ignored or missing explicit paths.
- [pi-selective-read](packages/extensions/pi-selective-read/README.md): highlight source spans within surrounding read context.
- [pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md): private prompt history and saved drafts, scoped to the working directory.
- [pi-todo](packages/extensions/pi-todo/README.md): session-backed tasks with progress widget and task browser.
- [pi-agent-summary](packages/extensions/pi-agent-summary/README.md): live elapsed runtime, bash-call counts, and file-change summaries kept outside model context.
- [pi-session-title](packages/extensions/pi-session-title/README.md): automatic session naming and `/auto-name` regeneration with a configured model.

## Development

See [development setup and commands](docs/development.md) and [package architecture](docs/architecture.md).
