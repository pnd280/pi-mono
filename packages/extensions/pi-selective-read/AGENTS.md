# [pi-selective-read](README.md) development

## Code navigation

- [src/tool.ts](src/tool.ts): native read delegation and parameters; [src/index.ts](src/index.ts): registration.
- [src/selection.ts](src/selection.ts) limits preview size. Shared [source-selection helpers](../../utils/README.md#source-selections) validate coordinates and slice source.
- [src/result.ts](src/result.ts): source/notice separation and preview provenance; [src/render.ts](src/render.ts): contextual rendering.

## Constraints

Preserve native content blocks and details. Exclude truncation and continuation notices from selected source. Delegate file access and images to Pi; never reread the file.

Keep source coordinates independent of terminal width; sanitize only display text. Keep preview validation consistent with the consuming [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-selective-read/README.md#arguments-and-results).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation) and [coverage boundaries](docs/testing.md). Do not re-test Pi's filesystem implementation.
