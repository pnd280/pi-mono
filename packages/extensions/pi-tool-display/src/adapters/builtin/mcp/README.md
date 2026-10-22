# Built-in MCP adapter

[pi-tool-display](../../../../README.md) · [Adapter development](../../../../docs/adapters.md)

MCP server tools from Pi's built-in MCP extension appear as cards with the server and tool name, the arguments, and an output preview. See [MCP tool cards](../../../../docs/tools.md#mcp-tools).

## Compatibility and selection

The adapter matches MCP server tools registered by Pi's built-in MCP extension: `builtin` source with path `builtin:mcp`, a tool name starting with `mcp__`, an `mcp__<server>` namespace, and an object parameter schema with `properties`. Server input schemas are otherwise arbitrary, so arguments only need to be an object.

The extension's resource tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) have no namespace and stay unmatched; they use generic cards. [`pi-mcp-adapter`](../../pi-mcp-adapter/README.md) tools have their own adapter. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

Pi 1.4.0 replaces every character outside `[A-Za-z0-9_]` with `_` and adds a hash suffix to colliding or overlong tool names. [MCP tool cards](../../../../docs/tools.md#mcp-tools) tells users which names override keys need. Default MCP exposure is `codemode`, with tool discovery through `searchTools()` or `ALL_TOOLS` rather than inline declarations.

## Display

[MCP tool cards](../../../../docs/tools.md#mcp-tools) describes what users see. Results and progress updates carry `details.server` and `details.tool`, which supply the unsanitised `server.tool` heading. Output uses the [MCP facts](../../../../docs/renderers.md#mcp-facts) preview. Pi's error flag marks returned MCP errors and thrown calls as failures.

Thrown or blocked calls carry an empty details object. Missing details are also accepted. Other detail shapes use generic cards.

The truncation warning and "Saved output" reference come from `details.fullOutputPath`. If saving failed, Pi records nothing structured, so the card adds no notice.

## Limitations

The adapter never reads saved output or connects to servers.

## Validation

The [colocated fixture](index.test.ts) mirrors Pi 1.4.0's private `createMcpToolDefinition` projection without opening a connection, and checks that rendering leaves arguments and results unchanged. No automated test covers discovery through codemode or selection for normalised, collision-suffixed names. Recheck them and the fixture's projection with the [nested-execution contracts](../../../../docs/pi-compatibility.md#nested-execution) when upgrading Pi. These checks do not establish external-service compatibility.
