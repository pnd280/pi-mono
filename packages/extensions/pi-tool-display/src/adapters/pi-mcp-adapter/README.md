# pi-mcp-adapter adapter

[pi-tool-display](../../../README.md) · [Adapter development](../../../docs/adapters.md)

MCP tool calls from [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) get cards that show the resolved `server.tool` name, arguments, and script operation counts. This page documents the adapter contract for its maintainers; if you use `pi-mcp-adapter`, read [Display](#display) for how its calls appear.

## Compatibility and selection

`piMcpAdapter(toolInfo)` checks that a tool really comes from `pi-mcp-adapter` by verifying its provenance and schemas. Provenance accepts any package version; the schemas were inspected in 2.33.0. It covers `mcp`, `mcpScript`, namespace proxies, and direct tools with any name. MCP-like tools from the SDK or other packages don't qualify. Unsupported retained arguments or details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

[MCP facts](../../../docs/renderers.md#mcp-facts) keep the published order of text and images. Flattened resource and audio descriptions stay text; Pi handles image bytes. Never substitute raw `details.mcpResult`: it may predate middleware or contain output-guard omissions.

The adapter interprets `details.error` as follows, even when Pi's error flag is false:

| Value                                    | Outcome                                  |
| ---------------------------------------- | ---------------------------------------- |
| `aborted`                                | Cancellation.                            |
| `tool_error`                             | Failure from a returned MCP error.       |
| `call_failed`, `input_required_needs_ui` | Failure.                                 |
| `script_error`, `timeout`                | Failure when `details.mode` is `script`. |

`call_failed` includes local failures, not necessarily transport errors. Failed operations remain diagnostics without failing successful scripts. Missing details and text that merely looks like an error establish no protocol facts. Pi's error flag overrides success and unavailable metadata. Confirmed cancellation wins over everything and uses `warning`.

## Display

Gateway summaries show the action and target. All MCP cards show arguments whatever `showParameters` says, because names alone may not identify the call. Long arguments and scripts use [previews](../../../docs/presentation.md#card-layout) until expanded. JSON strings are shown as given, never parsed or repaired.

Validated metadata supplies the resolved `server.tool`; without it, the card keeps the requested identity. Never decode namespace names: normalisation can lose information.

MCP calls remain individual cards outside exploration groups. Nonscript calls use output previews.

Completed scripts summarise validated `details.calls` records; calls, searches, and descriptions each count as operations:

- When the script and all recorded operations succeed, a nonzero total replaces emitted text in compact mode. Expansion restores that text.
- Failed or unfinished operations keep an output preview beside the total, with separate warning counts. An operation with `ok: false` and `error: "incomplete"` counts as unfinished rather than failed.
- Scripts with no recorded operations show `0 MCP operations` and keep an output preview.
- Malformed operation records use an output preview without a summary.
- Failed or cancelled scripts retain their operation count and diagnostic output even if their recorded nested operations succeeded.

Direct resource URIs and references to omitted raw MCP results appear on expansion. Truncation, saved-output references, and script operation failures remain visible when collapsed. Expanded cards keep the output guard's warning and saved-output reference in published text without adding them again; script operation failures remain separate notices.

## Limitations

This adapter does not load the MCP package or read its caches or saved output.

## Validation

The manual check needs `pi-mcp-adapter` installed separately, because it is not a workspace dependency. Follow the [pi-mcp-adapter terminal check](../../../docs/validation.md#pi-mcp-adapter), which uses an offline stdio server and keeps MCP caches and output inside the fixture.
