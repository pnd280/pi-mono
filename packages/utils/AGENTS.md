# [@pi-mono/utils](README.md) development

## Code navigation

[Helpers](README.md#usage)

FFF consumers: [FFF guard](../extensions/pi-fff-guard/AGENTS.md) and [nested instructions](../extensions/pi-nested-instructions/AGENTS.md).

Shared library consumers: [cooperative search](../libs/src/text-search/index.ts), [diff rendering](../libs/src/tui/components/diff-view/README.md), [bounded stream output](../libs/src/output-buffer/index.ts), and [bounded file output](../libs/src/bounded-output/index.ts).

## Constraints

Keep helpers pure; callers supply clocks, state, and policy. Put scheduling and I/O in [shared libraries](../libs/README.md).

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation).
