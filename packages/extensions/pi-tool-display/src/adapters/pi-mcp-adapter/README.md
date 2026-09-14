# pi-mcp-adapter integration

## Compatibility and selection

`piMcpAdapter(toolInfo)` supports the inspected [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) 2.33.0 registration contracts: `mcp`, `mcpScript`, namespace proxies, and direct tools with arbitrary configured names. It verifies package provenance and parameter schemas; SDK tools and unrelated tools with MCP-like names do not qualify. Unsupported retained arguments or details use generic cards.

See [automatic selection](../../../docs/adapters.md#automatic-selection) for renderer overrides and fallback policy.

## Argument and result contract

Published text and Pi image blocks remain in order in the adapter's [MCP facts](../../../docs/renderers.md#mcp-facts). Raw `details.mcpResult` never replaces published output: it may contain pre-middleware or output-guard-omitted data. Flattened resource/audio descriptions remain text, and image bytes stay in Pi's image path.

Structured `tool_error` identifies a returned MCP error. Other error codes appear as diagnostics; `call_failed` can include local processing failures, so it is not classified as a transport error. Missing details and plain error-looking text establish no additional protocol facts. Published Pi failure flags still control failure styling even when retained MCP metadata describes success.

## Display behavior and limitations

Gateway summaries show the selected action and target while parameter details remain hidden by default. Result metadata supplies resolved `server.tool` identities when available; otherwise cards retain the requested tool identity. Namespace names are not decoded into server names because normalization can lose information. MCP calls remain individual cards, outside exploration groups.

Direct resource URIs and bounded-result file references appear on expansion. Output truncation, saved-output references, and script operation failures remain visible when collapsed. Typed MCP errors use `error` styling.

This adapter does not load the MCP package or read its caches or saved output.

## Validation

The `mcp` prompt uses the offline [stdio backend](../../validation/mcp-server.ts) through the installed package. It covers gateway connection/description/calls, a namespace image/resource result, a direct tool, scripting, a returned error, and output truncation. The backend performs no network requests or filesystem work; the MCP package writes its normal cache and output artifacts inside the isolated fixture.

Create a [terminal fixture using the shared launcher](../../../docs/validation.md#terminal-procedure), then exit. In its printed directory, create `agent/mcp.json` with the following configuration. Replace `/absolute/path/to/pi-mono` with your checkout path:

```json
{
  "mcpServers": {
    "display": {
      "command": "node",
      "args": [
        "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/src/validation/mcp-server.ts"
      ],
      "lifecycle": "eager"
    },
    "direct": {
      "command": "node",
      "args": [
        "/absolute/path/to/pi-mono/packages/extensions/pi-tool-display/src/validation/mcp-server.ts"
      ],
      "lifecycle": "eager",
      "directTools": true
    }
  }
}
```

Reopen that fixture from the workspace root, explicitly loading the real installed package entry point and enabling its tools:

```sh
vpr 'pi-tool-display#validate:terminal' regular --reuse /tmp/pi-tool-display-terminal-EXAMPLE \
  -e /absolute/path/to/node_modules/pi-mcp-adapter/index.ts \
  --tools 'mcp,mcpScript,mcp__display,direct_echo'
```

Enter `mcp` and wait for `Fixture finished: mcp`. Check compact and expanded cards, then `/reload`. Exit and repeat the command with `fullscreen` instead of `regular`, retaining `--reuse`, `-e`, and `--tools`, to check replay.

- Resolved echo calls show `display.echo` or `direct.echo`; connection and description headings retain their action and target.
- Image/resource output stays beneath its call, returned errors remain visible, and large output retains a saved-output reference without reading that file.
- With `showParameters: true`, call arguments and script code remain available. Use an exact-name `original` override to compare the owner's UI; see [configuration](../../../README.md#configuration).
