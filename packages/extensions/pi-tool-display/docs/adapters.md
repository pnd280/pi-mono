# Adapter development

Adapters translate a verified tool contract into the shared display model. The public entry point is `pi-tool-display/adapters`; the [renderer API](renderers.md#explicit-contracts) describes its callbacks.

## Adding an adapter

Create `src/adapters/<provider>/index.ts` with a `ToolDisplayAdapterResolver`: `(tool: ToolInfo | undefined) => ToolDisplayAdapter | undefined`. Validate registered ownership and the required parameter schema before returning an adapter. Tool names alone do not establish ownership. Return `undefined` for unsupported definitions.

Keep argument/result validation, presentation, and tests in that directory. Shared renderers consume callbacks rather than recognizing provider names or result envelopes. If coordinated rendering depends on a result shape, implement [`supports(args, result)`](renderers.md#explicit-contracts). Before a result exists, `exploration` must handle partial arguments itself.

Native execution observation and unavailable-history notices remain separate because they require verified Pi factory provenance. Adapters receive retained arguments/results only: they do not enable tools, execute operations, inspect current files, change retained results or model context, or persist data.

## Automatic selection

Add the resolver to `extensionAdapterResolvers` in [`src/adapters/registry.ts`](../src/adapters/registry.ts). Selection applies, in order:

1. Invalid settings or `original`: preserve the original renderer.
2. `generic`: force generic rendering.
3. Verified native ownership: select the native contract.
4. Extension resolvers: use the first match, including when the verified owner supplies renderer slots.
5. Unmatched tools: preserve either owner renderer slot; otherwise use generic rendering.

A resolver entry explicitly opts its verified owner into automatic display replacement. This list is local source configuration, not a runtime registration API. Explicit SDK/tool-owner adapters can instead be passed directly to `createToolDisplayRenderers` without joining the list.

Historical generic rows adopt newly available contracts when tools register after reconstruction. Export an owner-facing factory from [`src/adapters/index.ts`](../src/adapters/index.ts) when it should be part of the public adapter API.

## FFF

`officialFffAdapter(toolInfo)` supports the inspected official `@ff-labs/pi-fff` 0.10.6 contracts. It verifies package provenance and parameter schemas before matching these names:

| Tool             | FFF-owned override | Summary arguments         |
| ---------------- | ------------------ | ------------------------- |
| `fffind`         | `find`             | `pattern`, `path`         |
| `ffgrep`         | `grep`             | `pattern`, `path`         |
| `fff-multi-grep` | `multi_grep`       | `patterns`, `constraints` |

Registered schemas must declare `pattern` as a string or `patterns` as an array. Retained patterns must be strings, including every multi-search element. Missing or empty result details are supported; nonempty details must contain finite numeric `totalMatched` and `totalFiles`. Incompatible retained calls or results use generic cards and do not join exploration groups.

Supported calls participate in exploration groups. See [card layout](renderers.md#card-layout) for empty-pattern behavior, literal scopes, summaries, and diagnostics, and [semantic colors](renderers.md#semantic-colors) for text-envelope provenance limits. The [provider validation procedure](validation.md#additional-provider-and-middleware-cases) covers checks with the installed official extension.

## pi-mcp-adapter

`officialMcpAdapter(toolInfo)` supports the inspected `pi-mcp-adapter` 2.33.0 registration contracts: `mcp`, `mcpScript`, namespace proxies, and direct tools with arbitrary configured names. It verifies package provenance and parameter schemas; SDK tools and unrelated tools with MCP-like names do not qualify. Unsupported retained arguments or details use generic cards.

Gateway summaries show the selected action and target while parameter details remain hidden by default. Result metadata supplies resolved `server.tool` identities when available; otherwise cards retain the requested tool identity. Namespace names are not decoded into server names because normalization can lose information. MCP calls remain individual cards, outside exploration groups.

Published text and Pi image blocks remain in order. Raw `details.mcpResult` never replaces published output: it may contain pre-middleware or output-guard-omitted data. Flattened resource/audio descriptions remain text, and image bytes stay in Pi's image path. Direct resource URIs and bounded-result file references appear on expansion. Output truncation, saved-output references, and script operation failures remain visible when collapsed.

Structured `tool_error` identifies a returned MCP error. Other error codes appear as diagnostics; `call_failed` can include local processing failures, so it is not classified as a transport error. Missing details and plain error-looking text establish no additional protocol facts. Published Pi failure flags still control failure styling even when retained MCP metadata describes success.

This adapter does not load the MCP package or read its caches or saved output. See the [MCP terminal fixture](validation.md#mcp-fixture) for validation with the installed package.
