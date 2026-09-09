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

## Development

[Commands and conventions](docs/development.md)
