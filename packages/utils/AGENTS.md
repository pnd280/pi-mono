# [@pi-mono/utils](README.md) development

Keep helpers pure. Callers supply Pi runtime state and policy, and scheduling and I/O belong in [shared libraries](../libs/README.md).

## Code navigation

The [README](README.md#usage) groups the exported modules by task.

| When you…                          | Read                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace package provenance consumers | [FFF guard](../extensions/pi-fff-guard/AGENTS.md), [nested instructions](../extensions/pi-nested-instructions/AGENTS.md), and the [tool-display adapters](../extensions/pi-tool-display/docs/adapters.md) |
| Trace shared-library consumers     | [bounded stream output](../libs/src/output-buffer/index.ts), and [file mutations](../libs/src/file-mutations/README.md)                                                                                   |

## Validation

For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
