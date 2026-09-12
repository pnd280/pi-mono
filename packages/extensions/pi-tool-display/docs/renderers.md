# Renderer integration

Tool owners and SDK hosts can use the public factory without the private CLI integration:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name)
});
```

The default is **generic**, even for names such as `read`, `bash`, or `server.search`. The factory changes only renderer fields. It does not execute or observe tools, read files, persist metadata, group independent host rows, or establish native ownership. Pi retains image rendering and the configured expansion action.

## Card layout

Native tools and explicit adapters hide parameter details by default. To show them in the automatic integration, set [`ext.pi-tool-display.showParameters`](../README.md#configuration) to `true`. Command/path/search summaries remain visible regardless; generic invocations always retain their arguments.

When enabled and expanded, parameter blocks use a straight `│` rule on every line, including wrapped continuations. Results and patch summaries start with `└`:

```text
• Searched … in **/AGENTS.md
  │ {
  │   "pattern": "",
  │   "path": "**/AGENTS.md",
  │   "limit": 10
  │ }
  └ packages/…/AGENTS.md
```

Wrapped generic invocations use the same straight rule. JSON token styling shares the **512 KiB** highlighting limit; larger arguments remain readable without token styling.

### Semantic colors

- **`dim`:** tree rules, JSON keys/punctuation, generated header annotations, empty/waiting messages (including native `(no output)`), FFF counts/pages and file annotations, routine timing/success metadata, and hints for collapsed rows that remain available on expansion.
- **`muted`:** unavailable historical observations and unknown operation details. Missing observations are not reported as execution failures.
- **`warning`:** cancellation, unconfirmed application, unavailable patches/previews, backend or budget omissions, and FFF continuation/fallback/capping notices.
- **`error`:** reported failures, native nonzero-exit/timeout diagnostics, failed application, and typed MCP errors. Process output preceding a native failure footer retains its own styling.
- **`accent`:** grouped `Read`/`Search`/`List` action labels, invocation-family tool identities, and pending indicators.
- **`toolTitle`, `text`, and `toolOutput`:** card titles, parameter/reference values, and retained result content respectively. Commands/source retain syntax highlighting; patch additions/removals retain diff colors.

Native and FFF adapters recognize only their inspected text envelopes. Generic output is not searched for placeholder or error phrases. Interpretation changes styling, not retained text, execution outcomes, or session facts. Live/saved previews carry ranges for inserted omission notices so identical text printed by a process remains ordinary output; colors are applied only during rendering.

## Explicit contracts

Pass a `ToolDisplayAdapter` from `pi-tool-display/adapters` to opt into interpretation. `nativeAdapter(name)` asserts compatibility with a supported Pi contract; it does not verify ownership or install native execution observation:

```ts
import { nativeAdapter } from "pi-tool-display/adapters";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...compatibleEdit,
  ...createToolDisplayRenderers(compatibleEdit.name, nativeAdapter("edit"))
});
```

The factory's third argument is a `ToolDisplayRendererOptions` object. Set `showParameters: true` to opt into parameter details; omission defaults to hidden for explicit adapters. Structured native/FFF parameters still require expansion; invocation-family adapters include enabled arguments in their invocation text. The standalone factory does not read CLI settings:

```ts
createToolDisplayRenderers(compatibleEdit.name, nativeAdapter("edit"), {
  showParameters: true
});
```

Coordinated hosts pass `binding: { call, coordinator }` in that same options object. Visibility follows the current adapter, including late FFF registration and generic fallback.

Native contracts use `path`, read `offset`/`limit`, search `pattern`/scope, shell `command`/`timeout`, and successful edit **`details.patch` in unified format**. Legacy numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

Adapters have:

- `id`: stable contract identifier. `pi:*`, `fff:*`, and `generic` are reserved by this package.
- `family`: `read`, `search`, `list`, `shell`, `edit`, `write`, or `invocation`.
- `invocation(args)`: optionally supply header `InvocationPart[]` (`value`, `annotation`, or `parameters`, each with `text`) when arguments differ from the family's native shape. The FFF multi-search adapter uses this for `patterns` and `constraints`. Parts follow parameter visibility and semantic styling; the type is exported from `pi-tool-display/adapters`.
- `exploration(args, result?)`: optional ordered `Read`/`Search`/`List` items for coordinated hosts; return `undefined` or an empty array when the contract is unavailable. Result updates can remove or restore a call's group membership without changing source order.
- `patch: true`: interpret successful `details.patch` as a bounded unified patch.
- `savedOutput: true`: declare `details.fullOutputPath` meaningful to a coordinated host. The standalone factory does not load files.
- `notices(result, expanded)`: return `DisplayNotice[]` with explicit semantics: `{ kind: "info" | "unavailable" | "warning" | "error", text }` or `{ kind: "reference", label, value }`. `info` uses `dim`; `unavailable` uses `muted`. Keep actionable diagnostics in compact groups and reserve routine counts for expansion.
- `textParts(text, args, context)`: optionally separate a known result envelope into `ResultTextPart[]` (`output`, `value`, `annotation`, `warning`, or `error`). Concatenated parts must preserve the supplied text exactly. The context supplies `isError`, `isPartial`, and whether the result contains images; do not infer facts from ordinary output. These types are exported from `pi-tool-display/adapters`.
- `mcp(args, result?)`: supply the typed facts below.

The automatic CLI integration also uses `officialFffAdapter(toolInfo)`. It checks current official FFF ownership and required schema/result shapes, including recognized FFF-owned override names. It neither enables disabled FFF tools nor calls the search engine. Historical generic rows adopt the FFF contract when its tools register after reconstruction. FFF's supplied cursor/fallback/capping text notices remain visible in compact groups; generic adapters do not interpret that envelope. `original` bypasses this explicit FFF integration; `generic` bypasses its specialized interpretation.

## MCP facts

A protocol owner can return `McpFacts` through its adapter:

```ts
import type { McpFacts, ToolDisplayAdapter } from "pi-tool-display/adapters";

const adapter: ToolDisplayAdapter = {
  id: "example:mcp-search",
  family: "invocation",
  mcp(_args, result): McpFacts | undefined {
    // decodeMcpFacts is the owner's validation of its own retained details.
    return decodeMcpFacts(result?.details);
  }
};
```

Facts contain `server`, `tool`, `outcome` (`transport-error`, `returned-error`, `success`, or `unavailable`), and ordered content blocks:

```ts
const facts: McpFacts = {
  server: "documentation",
  tool: "search",
  outcome: "success",
  content: [
    { type: "text", text: "Found one reference." },
    { type: "media", mimeType: "image/png", contentIndex: 1 },
    { type: "resource", uri: "file:///reference", text: "Retained resource text" }
  ]
};
```

Media entries reference Pi result blocks; do not copy base64 into display facts. Ordered textual/media/resource notices are rendered while actual inline images remain in Pi's image path. Lost transport/type information stays unavailable; generic rendering never infers it from names or error text. Arbitrary `details` are not dumped.

For the automatic integration's observation, persistence, and output budgets, see the [package README](../README.md#observation-and-saved-history).
