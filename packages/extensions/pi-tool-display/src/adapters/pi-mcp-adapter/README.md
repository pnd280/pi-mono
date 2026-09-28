# pi-mcp-adapter integration

[Tool coverage](../../../README.md#tool-coverage) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

`piMcpAdapter(toolInfo)` verifies [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) 2.33.0 provenance/schemas for `mcp`, `mcpScript`, namespace proxies, and arbitrarily named direct tools. SDK/unrelated MCP-like tools do not qualify; unsupported retained arguments/details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Arguments and results

[MCP facts](../../../docs/renderers.md#mcp-facts) preserve published text/image order. Flattened resource/audio descriptions remain text; Pi handles image bytes. Never substitute raw `details.mcpResult`: it may predate middleware or contain output-guard omissions.

The adapter interprets `details.error` as follows, even when Pi's error flag is false:

| Value                                    | Outcome                                  |
| ---------------------------------------- | ---------------------------------------- |
| `aborted`                                | Cancellation.                            |
| `tool_error`                             | Failure from a returned MCP error.       |
| `call_failed`, `input_required_needs_ui` | Failure.                                 |
| `script_error`, `timeout`                | Failure when `details.mode` is `script`. |

`call_failed` includes local failures, not necessarily transport errors. Failed operations remain diagnostics without failing successful scripts. Missing details/error-like text establish no protocol facts. Pi's error flag overrides success/unavailable metadata; confirmed cancellation wins and uses `warning`.

## Display

Gateway summaries show action/target. All MCP cards show arguments regardless of `showParameters`; names alone may be insufficient. Long arguments/scripts use [previews](../../../docs/presentation.md#card-layout) until expanded. JSON strings are not parsed/repaired.

Validated metadata supplies resolved `server.tool`; otherwise retain requested identity. Never decode namespace names: normalization can lose information.

MCP calls remain individual cards outside exploration groups. Nonscript calls use output previews.

Completed scripts summarize validated `details.calls` records. Tool calls, tool searches, and tool descriptions each count as operations:

- When the script and all recorded operations succeed, a nonzero total replaces emitted text in compact mode. Expansion restores that text.
- Failed or unfinished operations keep an output preview beside the total, with separate warning counts. An operation with `ok: false` and `error: "incomplete"` counts as unfinished rather than failed.
- Scripts with no recorded operations show `0 MCP operations` and keep an output preview.
- Malformed operation records use an output preview without a summary.
- Failed or cancelled scripts retain their operation count and diagnostic output even if their recorded nested operations succeeded.

Direct resource URIs and references to omitted raw MCP results appear on expansion. Output truncation, saved-output references, and script operation failures remain visible when collapsed. Failures use `error` for markers, status notices, and diagnostic bodies. Cancellation diagnostics use `warning`.

This adapter does not load the MCP package or read its caches or saved output.

## Validation

Install `pi-mcp-adapter` separately for `mcp`; it is not a workspace dependency. The offline [stdio backend](../../../validation/mcp-server.ts) performs no network/filesystem work; MCP caches/output stay inside the fixture.

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
5. Exit, then repeat the command with `fullscreen` instead of `regular` to check replay. Keep the `--reuse`, `-e`, and `--tools` arguments. Press **Ctrl+O** for compact cards.

- Resolved echo calls show `display.echo` or `direct.echo`. Connection and description headings retain their action and target.
- Images and resources stay beneath their call. Returned errors remain visible, and large output retains a saved-output reference without reading that file.
- Arguments and script code must remain visible with [`showParameters`](../../../README.md#configuration) omitted, `false`, or `true`. Run `/reload` after each setting change. Check that long parameters use previews when collapsed and appear in full when expanded.

Use an exact-name [`original` override](../../../README.md#configuration) to compare the MCP adapter's UI.
