# [@pi-mono/utils](README.md) development

Keep helpers pure; callers supply inputs and policy.

## Code navigation

[Helpers](README.md#usage)

| When you…                      | Read                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace FFF provenance consumers | [FFF guard](../extensions/pi-fff-guard/AGENTS.md) and [nested instructions](../extensions/pi-nested-instructions/AGENTS.md)                                                                   |
| Trace shared-library consumers | [diff rendering](../libs/src/tui/components/diff-view/README.md), [bounded stream output](../libs/src/output-buffer/index.ts), and [bounded file output](../libs/src/bounded-output/index.ts) |

## Constraints

Put scheduling and I/O in [shared libraries](../libs/README.md).

## Validation

Use [package validation](README.md#validation). For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
