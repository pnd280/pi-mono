# [@pi-mono/utils](README.md) development

Keep helpers pure; callers supply inputs and policy.

## Code navigation

[Helpers](README.md#usage)

| When you…                        | Read                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace FFF provenance consumers   | [FFF guard](../extensions/pi-fff-guard/AGENTS.md), [nested instructions](../extensions/pi-nested-instructions/AGENTS.md), and the [tool-display FFF adapter](../extensions/pi-tool-display/src/adapters/@ff-labs/pi-fff/README.md)                                                                               |
| Trace shared-library consumers   | [diff rendering](../libs/src/tui/components/diff-view/README.md), [bounded stream output](../libs/src/output-buffer/index.ts), [bounded file output](../libs/src/bounded-output/index.ts), [file mutations](../libs/src/file-mutations/README.md), and [Git ignore inspection](../libs/src/git-ignore/README.md) |
| Find every consumer of an export | Run `rg "@pi-mono/utils/<module>" packages`.                                                                                                                                                                                                                                                                     |

## Constraints

Put scheduling and I/O in [shared libraries](../libs/README.md).

## Validation

Use [package validation](README.md#validation). For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
