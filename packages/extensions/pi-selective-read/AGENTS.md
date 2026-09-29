# [pi-selective-read](README.md) development

## Code navigation

- [src/tool.ts](src/tool.ts): native read delegation and parameters; [src/result.ts](src/result.ts): preview provenance and source/notice separation.
- [src/selection.ts](src/selection.ts) and [src/render.ts](src/render.ts): preview and contextual rendering. Shared [source-selection helpers](../../utils/README.md#source-selections) own coordinate validation and slicing.

## Constraints

Preserve native content blocks and details. Exclude truncation and continuation notices from selected source. Delegate file access and images to Pi; never reread the file.

Keep source coordinates independent of terminal width; sanitize only display text. Keep preview validation consistent with the consuming [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-selective-read/README.md#arguments-and-results).

## Validation

Use [package validation](README.md#validation) and [coverage boundaries](docs/testing.md). For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md).
