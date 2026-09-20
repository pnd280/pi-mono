# [pi-selective-read](README.md) development

## Code navigation

- [src/index.ts](src/index.ts) registers the replacement. [src/tool.ts](src/tool.ts) adapts Pi's native tool and defines its parameters.
- [src/selection.ts](src/selection.ts) limits preview size. Shared [source-selection helpers](../../utils/README.md#source-selections) validate coordinates and slice source.
- [src/result.ts](src/result.ts) separates source from continuation notices and records which result blocks contain source.
- [src/render.ts](src/render.ts) renders selections within read context.

## Constraints

Preserve native content blocks and details. Exclude truncation and continuation notices from selected source. Delegate file access and images to Pi; never reread the file.

Keep source coordinates independent of terminal width; sanitize only display text. Keep preview validation consistent with the consuming [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-selective-read/README.md#arguments-and-results).

## Validation

Use [package validation](README.md#validation) and the shared [testing guidance](../../../docs/agents/testing.md). Cover preview bounds, invalid ranges, source-window boundaries, and native delegation without re-testing Pi's filesystem implementation.
