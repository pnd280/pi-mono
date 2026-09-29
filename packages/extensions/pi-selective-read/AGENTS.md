# [pi-selective-read](README.md) development

## Constraints

Preserve native content blocks and details. Exclude truncation and continuation notices from selected source. Delegate file access and images to Pi; never reread the file.

Use shared [source-selection helpers](../../utils/README.md#source-selections) for coordinate validation and slicing. Keep source coordinates independent of terminal width; sanitize only display text. Keep preview validation consistent with the consuming [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-selective-read/README.md#arguments-and-results).

## Validation

Use [package validation](README.md#validation) and [coverage boundaries](docs/testing.md). For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md).
