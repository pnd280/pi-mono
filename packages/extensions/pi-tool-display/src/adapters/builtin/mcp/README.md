# Built-in MCP adapter

[Adapter development](../../../../docs/adapters.md)

## Compatibility and selection

The adapter matches MCP server tools registered by Pi's built-in MCP extension: `builtin` source with path `builtin:mcp`, a tool name starting with `mcp__`, an `mcp__<server>` namespace, and an object parameter schema with `properties`. Server input schemas are otherwise arbitrary, so arguments only need to be an object.

The extension's resource tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) have no namespace and stay unmatched; they use generic cards. [`pi-mcp-adapter`](../../pi-mcp-adapter/README.md) tools have their own adapter. Renderer overrides still apply; see [automatic selection](../../../../docs/adapters.md#automatic-selection).

Pi 1.0.1 replaces every character outside `[A-Za-z0-9_]` with `_` and adds a hash suffix to colliding or overlong tool names; exact-name override keys must use the registered names. Default MCP exposure is `codemode`, with tool discovery through `searchTools()` or `ALL_TOOLS` rather than inline declarations.

## Cards

The adapter replaces Pi's own MCP renderer. Pending calls show Pi's tool name, such as `mcp__exa__web_search_exa`, because sanitized names may end in a hash and are never decoded. Results and progress updates carry `details.server` and `details.tool`, which switch the heading to the unsanitized `server.tool`, even when the result has no content. Arguments always stay visible, regardless of `showParameters`.

Output uses the ordinary [MCP facts](../../../../docs/renderers.md#mcp-facts) preview. Pi's error flag marks returned MCP errors and thrown calls as failures. Thrown or blocked calls have no details and keep Pi's tool name. Other detail shapes fall back to generic cards.

When Pi truncated the output and saved it, compact cards use `details.fullOutputPath` to add an "MCP output truncated; expand to inspect retained output." warning and a "Saved output" reference. Expanded cards keep Pi's warning and reference in the retained output without adding them again. If saving failed, Pi records nothing structured, so the card adds no notice; the truncation text remains in the output.

## Summary mode

Every call counts once in the shared MCP category, together with `pi-mcp-adapter` calls.

## Limitations

The adapter never reads saved output or connects to servers. Calls made inside codemode scripts appear only in the [codemode card](../codemode/README.md)'s nested-call list.

## Validation

Run [package validation](../../../../README.md#validation). The [colocated fixture](index.test.ts) mirrors Pi 1.0.1's private `createMcpToolDefinition` projection without opening a connection. The [offline host test](../../../../validation/mcp.test.ts) loads `builtin:mcp` and discovers a local stdio server through codemode, checking selection and original identities for normalized, collision-suffixed names. Recheck both boundaries when upgrading Pi; neither establishes external-service compatibility.
