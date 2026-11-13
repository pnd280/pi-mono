# [pi-profiles](README.md) development

Keep [src/index.ts](src/index.ts) a thin Pi adapter. It reads Pi's state, applies the decisions of [src/selection.ts](src/selection.ts), and keeps the lifecycle, the holds, the notices, and the settings reads. The selection module needs no Pi host. It decides what a switch, a restoration, and the `deny` enforcement do to the tools and the MCP servers, what the extension's `tool_search` sees, and the state of each tool in the menu. The `/profile` menu lives in [src/menu.ts](src/menu.ts), which loads on first use; the adapter gives it a snapshot of the profiles and tools. The menu only shows state: the change that it shows for a profile comes from the plan of the switch, and it switches through the same path as `/profile <name>`, after it closes, so it cannot change tools in a different way.

## Startup and shutdown

- Claim the shortcut through the lifecycle, not `pi.registerShortcut()`.
- Old sessions keep their selection entries. The extension skips entries that fail the schema, so a schema change loses those selections without an error.

## References

| When you change…                                | Read                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| Patterns, `defer`, or groups                    | [Tool resolution](docs/internals.md#tool-resolution) |
| The extension's `tool_search`                   | [Tool search](docs/internals.md#tool-search)         |
| Resume, `/fork`, `/tree`, or `/reload` handling | [Restoration](docs/internals.md#restoration)         |
| The editor label                                | [Editor](docs/internals.md#editor)                   |
