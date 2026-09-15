# [@pi-mono/utils](README.md) development

## Code navigation

[Helpers](README.md#usage)

Indirect consumers:

- Search: [cooperative search](../libs/src/text-search/README.md), then [prompt occurrence preparation](../extensions/pi-prompt-manager/src/search.ts) and [browser search](../libs/src/tui/components/browser/controller.ts).
- Patch types: [shared diff rendering](../libs/src/tui/components/diff-view/README.md), then [display result content](../extensions/pi-tool-display/src/rendering/result-content.ts).
- Output text and UTF-8: [bounded stream output](../libs/src/output-buffer/README.md) and [bounded file output](../libs/src/bounded-output/README.md), then [display preview loading](../extensions/pi-tool-display/src/observation/saved-output.ts).

## Constraints

Keep helpers pure. Callers supply clocks, state, and feature policy. Scheduling and I/O belong in [shared libraries](../libs/README.md).

## Validation

Use [package validation](README.md#validation).
