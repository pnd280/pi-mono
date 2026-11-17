# [pi-profiles](README.md) development

## Startup and shutdown

- Claim the shortcut through the lifecycle, not `pi.registerShortcut()`.
- Old sessions keep their selection entries. The extension skips entries that fail the schema, so a schema change loses those selections without an error.

## References

| When you change…                                        | Read                                                 |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Patterns, `defer`, groups, or the menu's change preview | [Tool resolution](docs/internals.md#tool-resolution) |
| The extension's `tool_search`                           | [Tool search](docs/internals.md#tool-search)         |
| Resume, `/fork`, `/tree`, or `/reload` handling         | [Restoration](docs/internals.md#restoration)         |
| The editor label                                        | [Editor](docs/internals.md#editor)                   |
