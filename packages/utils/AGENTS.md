# [@pi-mono/utils](README.md) development

## Code navigation

[Helpers](README.md#usage)

Direct FFF consumers: [FFF guard](../extensions/pi-fff-guard/AGENTS.md) and [nested instructions](../extensions/pi-nested-instructions/AGENTS.md) share provenance classification and search-scope normalization.

Indirect consumers:

- Search: [cooperative search](../libs/src/text-search/README.md), then [prompt occurrence preparation](../extensions/pi-prompt-manager/src/search.ts) and [browser search](../libs/src/tui/components/browser/controller.ts).
- Patch types: [shared diff rendering](../libs/src/tui/components/diff-view/README.md), then [display result content](../extensions/pi-tool-display/src/rendering/result-content.ts).
- Output text and UTF-8: [bounded stream output](../libs/src/output-buffer/README.md) and [bounded file output](../libs/src/bounded-output/README.md), then [display preview loading](../extensions/pi-tool-display/src/observation/saved-output.ts).

## Constraints

Keep helpers pure; callers supply clocks, state, and policy. Put scheduling and I/O in [shared libraries](../libs/README.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation).
