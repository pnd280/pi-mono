# pi-mcp-adapter adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

MCP tool calls from [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) get cards that show the resolved `server.tool` name, arguments, and script operation counts. See [MCP adapter cards](../../../docs/tools.md#mcp-adapter).

## Compatibility and selection

`piMcpAdapter(toolInfo)` checks that a tool comes from `pi-mcp-adapter` by verifying its provenance and schemas. Provenance accepts any package version; the schemas were inspected in 3.3.0. It covers `mcp`, `mcpScript`, namespace proxies, and direct tools with any name. MCP-like tools from the SDK or other packages don't qualify. Unsupported retained arguments or details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

[MCP facts](../../../docs/renderers.md#mcp-facts) keep the published order of text and images. Flattened resource and audio descriptions stay text; Pi handles image bytes. Never substitute raw `details.mcpResult`, because it may predate middleware or contain output-guard omissions.

The adapter interprets `details.error` as follows, even when Pi's error flag is false:

| Value                                    | Outcome                                  |
| ---------------------------------------- | ---------------------------------------- |
| `aborted`                                | Cancellation.                            |
| `tool_error`                             | Failure from a returned MCP error.       |
| `call_failed`, `input_required_needs_ui` | Failure.                                 |
| `script_error`, `timeout`                | Failure when `details.mode` is `script`. |

`call_failed` includes local failures, not necessarily transport errors. Failed operations remain diagnostics without failing successful scripts. Missing details and text that only looks like an error establish no protocol facts. Pi's error flag overrides success and unavailable metadata. Confirmed cancellation wins over everything and uses `warning`.

## Display

[MCP adapter cards](../../../docs/tools.md#mcp-adapter) describes what users see. Validated metadata supplies the resolved `server.tool`. Never decode namespace names, because normalisation can lose information. Script summaries count validated `details.calls` records.

## Limitations

This adapter does not load the MCP package or read its caches or saved output.

## Validation

The manual check needs `pi-mcp-adapter` installed separately, because it is not a workspace dependency. Follow the [pi-mcp-adapter terminal check](../../../docs/validation.md#pi-mcp-adapter), which uses an offline stdio server and keeps MCP caches and output inside the fixture.
