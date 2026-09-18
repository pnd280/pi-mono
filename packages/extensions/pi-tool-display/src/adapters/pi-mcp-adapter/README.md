# pi-mcp-adapter integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piMcpAdapter(toolInfo)` supports [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) 2.33.0 registration contracts for `mcp`, `mcpScript`, namespace proxies, and direct tools with arbitrary configured names.

It verifies package provenance and parameter schemas. SDK tools and unrelated tools with MCP-like names do not qualify. Unsupported retained arguments or details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

The adapter's [MCP facts](../../../docs/renderers.md#mcp-facts) preserve the order of published text and Pi image blocks. Flattened resource and audio descriptions remain text, and Pi handles image bytes.

Raw `details.mcpResult` never replaces published output because it may contain data from before middleware ran or data omitted by the output guard.

The adapter interprets `details.error` as follows, even when Pi's error flag is false:

| Value                                    | Outcome                                  |
| ---------------------------------------- | ---------------------------------------- |
| `aborted`                                | Cancellation.                            |
| `tool_error`                             | Failure from a returned MCP error.       |
| `call_failed`, `input_required_needs_ui` | Failure.                                 |
| `script_error`, `timeout`                | Failure when `details.mode` is `script`. |

`call_failed` can include local processing failures, so it does not establish a transport error. A successful script's individual failed operations remain diagnostics without changing the script's outcome.

Missing details and error-like text establish no additional protocol facts. Pi's error flag still marks failure when MCP metadata reports success or an unavailable outcome. Confirmed cancellation takes precedence and uses `warning` styling.

## Display

Gateway summaries show the selected action and target while parameter details remain hidden by default. Result metadata supplies resolved `server.tool` identities when available. Otherwise, cards retain the requested tool identity. The adapter does not decode namespace names into server names because normalization can lose information.

MCP calls remain individual cards, outside exploration groups. Calls other than scripts use output previews.

Completed scripts summarize validated `details.calls` records. Tool calls, tool searches, and tool descriptions each count as operations:

- When the script and all recorded operations succeed, a nonzero total replaces emitted text in compact mode. Expansion restores that text.
- Failed or unfinished operations keep an output preview beside the total, with separate warning counts. An operation with `ok: false` and `error: "incomplete"` counts as unfinished rather than failed.
- Scripts with no recorded operations show `0 MCP operations` and keep an output preview.
- Malformed operation records use an output preview without a summary.

Direct resource URIs and references to omitted raw MCP results appear on expansion. Output truncation, saved-output references, and script operation failures remain visible when collapsed. Failures use `error` for markers, status notices, and diagnostic bodies. Cancellation diagnostics use `warning`.

This adapter does not load the MCP package or read its caches or saved output.

## Validation

The `mcp` prompt requires a separate installation of `pi-mcp-adapter`, which is not a workspace dependency. The offline [stdio backend](../../../validation/mcp-server.ts) performs no network requests or filesystem work. The MCP package writes its cache and output artifacts inside the isolated fixture.

1. Create a [terminal fixture using the shared launcher](../../../docs/validation.md#terminal-launcher), then exit.
2. In the printed fixture directory, create `agent/mcp.json` with the following configuration. Replace `/absolute/path/to/pi-mono` with your checkout path:

   ```json
   {
     "mcpServers": {
       "display": {
         "command": "node",
         "args": [
           "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/validation/mcp-server.ts"
         ],
         "lifecycle": "eager"
       },
       "direct": {
         "command": "node",
         "args": [
           "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/validation/mcp-server.ts"
         ],
         "lifecycle": "eager",
         "directTools": true
       }
     }
   }
   ```

3. Reopen that fixture from the workspace root, using its printed path and the installed package entry point:

   ```sh
   vpr 'pi-tool-display#validate:terminal' regular --reuse /tmp/pi-tool-display-terminal-EXAMPLE \
     -e /absolute/path/to/node_modules/pi-mcp-adapter/index.ts \
     --tools 'mcp,mcpScript,mcp__display,direct_echo'
   ```

4. Enter `mcp` and wait for `Fixture finished: mcp`. Check collapsed and expanded cards against the expectations below, then run `/reload`.
5. Exit, then repeat the command with `fullscreen` instead of `regular` to check replay. Keep the `--reuse`, `-e`, and `--tools` arguments.

- Resolved echo calls show `display.echo` or `direct.echo`. Connection and description headings retain their action and target.
- Images and resources stay beneath their call. Returned errors remain visible, and large output retains a saved-output reference without reading that file.
- With `showParameters: true`, call arguments and script code remain available. Use an exact-name [`original` override](../../../README.md#configuration) to compare the MCP adapter's UI.
