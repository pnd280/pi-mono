# pi-mcp-adapter integration

[Supported tools](../../../README.md#supported-tools) · [Adapter development](../../../docs/adapters.md)

## Compatibility and selection

MCP tool calls from [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) get cards that show the resolved `server.tool` name, arguments, and script operation counts.

`piMcpAdapter(toolInfo)` checks that a tool really comes from `pi-mcp-adapter` 2.33.0 by verifying its provenance and schemas. It covers `mcp`, `mcpScript`, namespace proxies, and direct tools with any name. MCP-like tools from the SDK or other packages don't qualify. Unsupported retained arguments or details use generic cards.

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

Validated metadata supplies the resolved `server.tool`; without it, the card keeps the requested identity. Never decode namespace names: normalization can lose information.

MCP calls remain individual cards outside exploration groups. Nonscript calls use output previews.

Completed scripts summarise validated `details.calls` records; calls, searches, and descriptions each count as operations:

- When the script and all recorded operations succeed, a nonzero total replaces emitted text in compact mode. Expansion restores that text.
- Failed or unfinished operations keep an output preview beside the total, with separate warning counts. An operation with `ok: false` and `error: "incomplete"` counts as unfinished rather than failed.
- Scripts with no recorded operations show `0 MCP operations` and keep an output preview.
- Malformed operation records use an output preview without a summary.
- Failed or cancelled scripts retain their operation count and diagnostic output even if their recorded nested operations succeeded.

Direct resource URIs and references to omitted raw MCP results appear on expansion. Truncation, saved-output references, and script operation failures remain visible when collapsed. Expanded cards keep the output guard's warning and saved-output reference in published text without adding them again; script operation failures remain separate notices.

This adapter does not load the MCP package or read its caches or saved output.

## Validation

Install `pi-mcp-adapter` separately for `mcp`; it is not a workspace dependency. The offline [stdio backend](../../../validation/mcp-server.ts) does no network or filesystem work. MCP caches and output stay inside the fixture.

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

4. Press **Ctrl+O** for compact cards, then enter `mcp` and wait for `Fixture finished: mcp`. Check collapsed and expanded cards against the expectations below, then run `/reload`.
5. Exit, then repeat the command with `fullscreen` instead of `regular` to check replay. Keep the `--reuse`, `-e`, and `--tools` arguments. Press **Ctrl+O** for compact cards.

| Do                                                                                                                | Expect                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Inspect resolved echo calls.                                                                                      | Headings show `display.echo` or `direct.echo`.                |
| Inspect connection and description calls.                                                                         | Headings keep their action and target.                        |
| Inspect images, resources, and returned errors.                                                                   | They stay visible beneath their call.                         |
| Inspect large output in both card modes.                                                                          | The saved-output reference stays visible.                     |
| Omit [`showParameters`](../../../README.md#configuration), then try `false` and `true`, with `/reload` each time. | Arguments and script code stay visible in each configuration. |
| Expand a card with long parameters.                                                                               | The compact preview expands to the full parameters.           |
| Set an exact-name [`original` override](../../../README.md#configuration).                                        | The card uses the tool owner's renderer.                      |

These checks inspect retained output; the display adapter never reads the saved file.
