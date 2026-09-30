# Built-in MCP adapter

[Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

Matches MCP server tools registered by Pi's built-in MCP extension: `builtin` source with path `builtin:mcp`, a tool name starting with `mcp__`, an `mcp__<server>` namespace, and an object parameter schema with `properties`. Server input schemas are otherwise arbitrary, so arguments only need to be an object.

The extension's resource tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) have no namespace and stay unmatched; they use generic cards. [`pi-mcp-adapter`](../../pi-mcp-adapter/README.md) tools have their own adapter. Renderer overrides still apply.

## Cards

The adapter replaces Pi's own MCP renderer. Pending calls show Pi's tool name, such as `mcp__exa__web_search_exa`, because sanitized names may end in a hash and are never decoded. Results and progress updates carry `details.server` and `details.tool`, which switch the heading to the unsanitized `server.tool`, even when the result has no content. Arguments always stay visible, regardless of `showParameters`.

Output uses the ordinary [MCP facts](../../../../docs/renderers.md#mcp-facts) preview. Pi's error flag marks returned MCP errors and thrown calls as failures. Thrown or blocked calls have no details and keep Pi's tool name. Other detail shapes fall back to generic cards.

When Pi truncated the output and saved it, `details.fullOutputPath` adds an **MCP output truncated.** warning and a **Saved output** reference. If saving failed, Pi records nothing structured, so the card adds no notice; the truncation text remains in the output.

## Summary mode

Every call counts once in the shared MCP category, together with `pi-mcp-adapter` calls.

## Limitations

The adapter never reads saved output or connects to servers. Calls made inside codemode scripts appear only in the [codemode card](../codemode/README.md)'s nested-call list.

## Validation

Run [package validation](../../../../README.md#validation). The [colocated fixture](index.test.ts) mirrors Pi 0.99.1's private `createMcpToolDefinition` projection without opening a connection. Recheck that projection when upgrading Pi.
