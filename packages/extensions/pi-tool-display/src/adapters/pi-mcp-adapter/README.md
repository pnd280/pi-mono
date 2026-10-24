# pi-mcp-adapter adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

MCP tool calls from [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) get cards that show the resolved `server.tool` name, arguments, and script operation counts. See [MCP adapter cards](../../../docs/tools.md#mcp-adapter).

## Compatibility and selection

`piMcpAdapter(toolInfo)` checks that a tool comes from `pi-mcp-adapter` by verifying its provenance and schemas. Provenance accepts any package version; the schemas were inspected in 3.3.0. It covers `mcp`, `mcpScript`, namespace proxies, and direct tools with any name. MCP-like tools from the SDK or other packages don't qualify. Unsupported retained arguments or details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy. The [adapter contract](contract.md) lists how result details become outcomes and headings.

## Validation

Follow the [pi-mcp-adapter terminal check](../../../docs/validation.md#pi-mcp-adapter). It needs `pi-mcp-adapter` installed separately, uses an offline stdio server, and keeps MCP caches and output inside the fixture.
