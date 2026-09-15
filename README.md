# pi-mono

## Setup

Install the [Vite+ CLI (`vp`)](https://viteplus.dev/guide/), then run from the repository root:

```sh
vp install --frozen-lockfile
vp hooks enable
```

Extensions load directly from TypeScript; there is no build step.

## Extensions

- [pi-tool-display](packages/extensions/pi-tool-display/README.md): compact, borderless tool activity with expandable output and numbered diffs.
- [pi-fff-guard](packages/extensions/pi-fff-guard/README.md): block FFF searches targeting Git-ignored or missing explicit paths so the model can retry.
- [pi-prompt-manager](packages/extensions/pi-prompt-manager/README.md): private, directory-scoped prompt history and saved drafts with search, preview, native copying, and editor restoration.

## Development

[Architecture](docs/architecture.md) · [Commands and conventions](docs/development.md)
