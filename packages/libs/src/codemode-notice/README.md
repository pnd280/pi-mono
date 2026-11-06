# Codemode notice

[Library index](../../README.md#usage)

The model can call a `model-only` tool only directly, never from a codemode script, and Pi does not tell the model so. [`withCodemodeNotice(definition)`](index.ts) (`@pi-mono/libs/codemode-notice`) tells it in the tool's description, but only while the model can use codemode.

## Behaviour

- The returned definition adds a `prepareLoadout` hook. While a tool named `codemode` is declared to the model, the hook ends the tool's declared description with "Call this tool directly. It is not available inside codemode."
- While `codemode` is not declared, the description is the original one. Pi runs the hook each time the active tools change, so the notice follows them.
- The notice goes only in the description. `promptSnippet` and `promptGuidelines` stay unchanged.
- A codemode-like tool under another name does not add the notice. A hook that hides the `codemode` declaration does not remove it.

## Usage

```ts
import { withCodemodeNotice } from "@pi-mono/libs/codemode-notice";

pi.registerTool(
  withCodemodeNotice({
    name: "compact",
    exposure: "model-only",
    label: "Compact context",
    description: "Compact the session context",
    parameters,
    execute
  })
);
```
