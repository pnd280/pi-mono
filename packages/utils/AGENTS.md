# [@pi-mono/utils](README.md) development

Keep helpers pure.

## Code navigation

[Helpers](README.md#usage)

| When you…                        | Read                                                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace FFF provenance consumers   | [FFF guard](../extensions/pi-fff-guard/AGENTS.md), [nested instructions](../extensions/pi-nested-instructions/AGENTS.md), and the [tool-display FFF adapter](../extensions/pi-tool-display/src/adapters/@ff-labs/pi-fff/README.md) |
| Trace shared-library consumers   | [diff rendering](../libs/src/tui/components/diff-view/README.md), [bounded stream output](../libs/src/output-buffer/index.ts), and [file mutations](../libs/src/file-mutations/README.md)                                          |
| Find every consumer of an export | Run `rg "@pi-mono/utils/<module>" packages`.                                                                                                                                                                                       |

## Constraints

Do not add Pi runtime state or consumer policy, and put scheduling and I/O in [shared libraries](../libs/README.md).

## Validation

Use [coverage](docs/testing.md). For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
