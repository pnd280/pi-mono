# Built-in MCP adapter contract

[Built-in MCP adapter](README.md) · [Adapter development](../../../../docs/adapters.md)

Adapter maintainers use this contract when they change result handling. [MCP tool cards](../../../../docs/tools.md#mcp-tools) describes what users see.

## Arguments and results

- Results and progress updates carry `details.server` and `details.tool`, which supply the unsanitised `server.tool` heading.
- Thrown or blocked calls carry an empty details object. Missing details are also accepted. Other detail shapes use generic cards.
- Pi's error flag marks returned MCP errors and thrown calls as failures.

## Display

Output uses the [MCP facts](../../../../docs/renderers.md#mcp-facts) preview. The truncation warning and "Saved output" reference come from `details.fullOutputPath`. If saving failed, Pi records nothing structured, so the card adds no notice.

## Limitations

The adapter never reads saved output or connects to servers.
