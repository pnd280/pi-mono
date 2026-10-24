# pi-mcp-adapter adapter contract

[pi-mcp-adapter adapter](README.md) · [Adapter development](../../../docs/adapters.md)

Adapter maintainers use this contract when they change result handling. [MCP adapter cards](../../../docs/tools.md#mcp-adapter) describes what users see.

## Arguments and results

[MCP facts](../../../docs/renderers.md#mcp-facts) keep the published order of text and images. Flattened resource and audio descriptions stay text; Pi handles image bytes. Never substitute raw `details.mcpResult`, because it may predate middleware or contain output-guard omissions.

The adapter interprets `details.error` as follows, even when Pi's error flag is false:

| Value                                    | Outcome                                  |
| ---------------------------------------- | ---------------------------------------- |
| `aborted`                                | Cancellation.                            |
| `tool_error`                             | Failure from a returned MCP error.       |
| `call_failed`, `input_required_needs_ui` | Failure.                                 |
| `script_error`, `timeout`                | Failure when `details.mode` is `script`. |

- `call_failed` includes local failures, not necessarily transport errors.
- Failed operations remain diagnostics without failing successful scripts.
- Missing details and text that only looks like an error establish no protocol facts.
- Pi's error flag overrides success and unavailable metadata.
- Confirmed cancellation wins over everything and uses `warning`.

## Display

Validated metadata supplies the resolved `server.tool`. Never decode namespace names, because normalisation can lose information. Script summaries count validated `details.calls` records.

## Limitations

This adapter does not load the MCP package or read its caches or saved output.
