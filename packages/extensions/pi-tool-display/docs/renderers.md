# Renderer integration

Tool owners and SDK hosts can use the public factory without the private CLI integration:

```ts
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...original,
  ...createToolDisplayRenderers(original.name)
});
```

The default is **generic**, even for names such as `read`, `bash`, or `server.search`. Opt into specialized rendering with an [explicit contract](#explicit-contracts). The factory changes only renderer fields. It does not execute or observe tools, read files, persist metadata, or establish native ownership. Grouping has no public API; it requires the automatic CLI integration. Pi retains [image rendering](validation.md#platform-limitations) and the configured expansion action.

## Card layout

Pending headings cover argument streaming, queueing, and execution; they do not confirm that execution has started or a change has applied. Cancelled calls and missing historical outcomes use `Cancelled` and `Outcome unavailable`.

Concrete file targets (`path` parts) in summaries use paths relative to the rendering context's cwd when inside it, and absolute paths when outside it. The cwd itself displays as `.`. Grouped reads retain directory names and read ranges. Resolution is lexical, including home expansion, without inspecting current files or following symlinks. Raw parameter blocks, retained output, generic arguments, and literal scope/filter expressions are not rewritten.

Collapsed text bodies show initial and final output. Above the [formatting limit](#resource-limits), they show bounded head/tail excerpts with `… more output`. Excerpts preserve whole graphemes and ANSI styling. Expansion shows all retained output, subject to live/saved-output retention limits.

Compact exploration keeps every call in source order, including repeated reads. Visible assistant content, diagnostics, cache-miss notices, compaction summaries/notices, and rendered custom entries separate groups; hidden content does not. Assistant content separates groups before that message's tools, even if it arrives later. Tool-result notices and failure diagnostics stay immediately beneath their originating invocation:

```text
• Explored
  ├ Read screenshot.png
  │   [Image: image/png]
  ├ Search renderers in src/
  │   [0 exact matches. Maybe you meant this?]
  └ Read renderers.ts
```

### Semantic colors

- **`dim`:** tree rules, JSON keys/punctuation, generated header annotations, empty/waiting messages, routine timing/success metadata, and hints for collapsed rows that remain available on expansion.
- **`muted`:** unavailable historical observations and unknown operation details. Missing observations are not reported as execution failures.
- **`warning`:** cancellation, unconfirmed application, unavailable patches/previews, backend or budget omissions, and actionable adapter diagnostics.
- **`error`:** reported failures and failed application.
- **`accent`:** grouped `Read`/`Search`/`List` action labels, invocation-family tool identities, and pending indicators.
- **`syntaxString`:** explicitly tagged search patterns in compact, standalone, and expanded summaries. Scope/filter text retains `text`; patterns are not parsed as code or rewritten.
- **`toolTitle`, `text`, and `toolOutput`:** card titles, parameter/reference values, and retained result content respectively. Commands/source retain syntax highlighting; patch additions/removals retain diff colors.

Adapters may interpret known result envelopes through [`textParts`](#explicit-contracts). Generic output is not searched for extension-specific phrases. Interpretation changes presentation, not retained text, execution outcomes, or session facts. Contract-specific styling and provenance limits live with the [built-in adapters](adapters.md#built-in-adapters).

Live and saved-output previews distinguish generated omissions from process text. Identical literal output in those previews retains ordinary styling.

## Diff viewer

Mixed patches use side-by-side columns when space permits; narrow terminals and one-sided patches use unified rows. Write cards omit counts for one-sided patches, while edit cards retain them. Compact previews prioritize changed code and nearby context, with omission hints for excerpts and remaining hunks.

Pi's whole-card expansion action reveals **every retained hunk** with full wrapping. Hunks have no separate input controls. Added/removed rows and inline changes use Pi's theme colors; context and separators retain the terminal background.

Only retained patch context is available; rendering never reads current files. Invalid, incomplete, multi-file, and oversized patches display an unavailable notice. A valid displayed patch suppresses observation-budget warnings, including in retained history. See [resource limits](#resource-limits) for patch generation and retention bounds.

## Resource limits

| Resource                  | Limit                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Collapsed text formatting | 16,384 UTF-16 code units of styled text, split between the start and end, plus carried ANSI state. Expansion shows all retained text.                        |
| Syntax highlighting       | 512 KiB per text. Larger source and JSON remain readable without token styling.                                                                              |
| Live shell output         | Full output through 1 MiB. Above 1 MiB, the first 50 and last 50 lines plus any partial line, capped at 10,280 bytes per line.                               |
| Saved output preview      | 256 KiB and 4,000 lines, with bounded reads from the start and end of the file. At most 8 cached previews and 8 concurrent reads.                            |
| Generated patch input     | 64 KiB per text, a cooperative 50 ms search timeout, and a 2,000 changed-line edit-distance limit. Native edit patches bypass these input and search limits. |
| Retained patch            | 128 KiB.                                                                                                                                                     |

Live/saved-output collection and patch generation belong to the [automatic integration](../README.md#observation-and-saved-history), not the standalone factory.

## Explicit contracts

Pass a `ToolDisplayAdapter` from `pi-tool-display/adapters` to opt into interpretation. For example, a tool owner can supply a compatible [native contract](../src/adapters/native/README.md#compatibility-and-selection) without enabling execution observation:

```ts
import { nativeAdapter } from "pi-tool-display/adapters";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

pi.registerTool({
  ...compatibleEdit,
  ...createToolDisplayRenderers(compatibleEdit.name, nativeAdapter("edit"))
});
```

The factory's third argument is a `ToolDisplayRendererOptions` object. Set `showParameters: true` to opt into parameter details; omission defaults to hidden for explicit adapters. Structured parameter blocks still require expansion; invocation-family adapters include enabled arguments in their invocation text. The standalone factory does not read CLI settings:

```ts
createToolDisplayRenderers(compatibleEdit.name, nativeAdapter("edit"), {
  showParameters: true
});
```

Adapters have:

- `id`: stable contract identifier. `pi:*`, `@ff-labs/pi-fff:*`, `pi-mcp-adapter:*`, and `generic` are reserved by this package.
- `family`: `read`, `search`, `list`, `shell`, `edit`, `write`, or `invocation`.
- `supports(args, result)`: optionally validate retained data for the automatic CLI integration. Returning `false` uses generic rendering and removes the call from exploration groups; a later supported result restores the adapter. Omission accepts the result. This callback runs only once a result exists, including partial updates; it does not change the selected adapter or retained data. Standalone factories use their explicitly supplied adapter directly.
- `headingVerbs(args)`: optionally return a `[pending, complete]` pair to override action wording for supplied arguments. Omission or `undefined` uses the family's verbs. Cancellation and unavailable outcomes still take precedence; result presentation is unchanged.
- `invocation(args, result?)`: optionally supply header `InvocationPart[]` (`value`, `path`, `pattern`, `annotation`, or `parameters`, each with `text`) when arguments differ from the family's native shape. Use `path` for a concrete file target, `pattern` for a highlighted search pattern, and `value` for other literal text or filter expressions. Paths are formatted against Pi's render cwd; adapter callbacks still receive the original arguments. Only `parameters` parts are hidden when `showParameters` is false, including for invocation-family adapters. Put optional parameter delimiters inside that part so hiding it leaves no empty punctuation. Use the optional retained result to resolve tool identities. The type is exported from `pi-tool-display/adapters`.
- `exploration(args, result?)`: optional ordered `{ label: "Read" | "Search" | "List", parts: InvocationPart[] }` items for the automatic CLI integration; return `undefined` or an empty array when the contract is unavailable. Result updates can remove or restore a call's group membership without changing source order.
- `patch: true`: interpret successful `details.patch` as a bounded unified patch.
- `savedOutput: true`: declare `details.fullOutputPath` meaningful to the automatic CLI integration. The standalone factory does not load files.
- `notices(result, expanded)`: return `DisplayNotice[]` with explicit semantics: `{ kind: "info" | "unavailable" | "warning" | "error", text }` or `{ kind: "reference", label, value }`. `info` uses `dim`; `unavailable` uses `muted`. Keep actionable diagnostics in compact groups and reserve routine counts for expansion.
- `textParts(text, args, context)`: optionally separate a known result envelope into `ResultTextPart[]` (`output`, `value`, `annotation`, `warning`, or `error`). Preserve result content; only explicitly recognized routine metadata may be omitted from presentation. Returning an empty array suppresses the text block without an empty-output placeholder. The retained result remains unchanged. The context supplies `isError`, `isPartial`, and whether the result contains images; do not infer facts from ordinary output. These types are exported from `pi-tool-display/adapters`.
- `imageCaptionMimeType(text)`: optionally identify the MIME type described by a known text caption. For complete successful results, a matching adjacent image omits its redundant generated fallback label. The caption text and Pi-owned image remain unchanged.
- `mcp(args, result?)`: supply typed [MCP facts](#mcp-facts).

See [adapter development](adapters.md) for automatic selection, built-in contracts, and integrating another extension.

## MCP facts

The `ToolDisplayAdapter.mcp(args, result?)` callback returns `McpFacts`, or `undefined` when typed facts are unavailable. Facts contain `server`, `tool`, `outcome` (`transport-error`, `returned-error`, `success`, or `unavailable`), and ordered content blocks:

```ts
import type { McpFacts } from "pi-tool-display/adapters";

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
