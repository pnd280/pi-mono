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

Pending standalone and expanded cards use `Reading`, `Searching`, `Listing`, `Running`, `Editing`, `Writing`, or `Calling` throughout argument streaming, queueing, and execution. These headings describe the pending call, not confirmation that execution has started or a change has applied. Compact exploration groups use `Exploring`. Completed calls use past-tense headings; cancellation and missing historical outcomes remain `Cancelled` and `Outcome unavailable`.

File targets in read/edit/write and native search/list summaries use paths relative to the rendering context's cwd when inside it, and absolute paths when outside it. The cwd itself displays as `.`. Grouped reads retain directory names and read ranges. Resolution is lexical, including home expansion, without inspecting current files or following symlinks. Raw parameter blocks, retained output, generic arguments, and FFF search/filter expressions are not rewritten.

For FFF single-pattern tools, explicit empty strings have dedicated summaries: `ffgrep` shows `Search ""` in compact groups and `Searched "" in .` when expanded; a supplied scope appears after `in` unchanged. Empty `fffind` patterns show `List files in <scope>` / `Listed files in <scope>`, with `.` as the default scope. Missing patterns use `(pattern missing)` in specialized headings and do not qualify for grouping.

FFF pagination instructions, routine limit hints, and page-number notices are omitted from both compact and expanded cards. Matches remain available on expansion; query/fallback diagnostics remain visible in compact groups, including warnings containing multiline queries. Retained results and model context keep the original pagination data. Generic adapters do not interpret that envelope.

Tree branches represent meaningful items: tool invocations in a compact exploration group, or independent result items within a standalone card.

Warnings, related diagnostics, references, and routine metadata are continuation lines, not additional branches. A patch's hunks and diagnostics form one result item. Independent images and typed MCP content retain their order. Call-level notices for multiple independent results continue the card heading.

Native image captions suppress equivalent generated fallback descriptions without changing the retained result. Native model-support and image conversion/resize omission warnings remain visible in compact standalone and grouped reads, and appear once in expanded bodies. Patch and live/saved-text previews retain image fallback notices when Pi's native image display is unavailable or disabled.

Compact exploration keeps every call in source order, including repeated reads. Visible assistant content, diagnostics, cache-miss notices, compaction summaries/notices, and rendered custom entries separate groups; hidden content does not. Assistant content separates groups before that message's tools, even if it arrives later. Finalized-message middleware can remove that separator by removing the visible content. Tool-result notices and failure diagnostics stay immediately beneath their originating invocation:

```text
• Explored
  ├ Read screenshot.png
  │   [Image: image/png]
  ├ Search renderers in src/
  │   [0 exact matches. Maybe you meant this?]
  └ Read renderers.ts
```

When [enabled](../README.md#configuration) and expanded, parameter blocks continue the heading with a straight `│` rule through soft wraps when a visible result follows. Without a visible result, they use indentation instead of an unfinished rail:

```text
• Listed files in **/AGENTS.md
  │ {
  │   "pattern": "",
  │   "path": "**/AGENTS.md",
  │   "limit": 10
  │ }
  └ packages/…/AGENTS.md
```

Wrapped generic invocations use the same continuation rule. Syntax highlighting and JSON token styling are skipped above **512 KiB**; the text remains readable.

### Semantic colors

- **`dim`:** tree rules, JSON keys/punctuation, generated header annotations, empty/waiting messages (including native `(no output)`), FFF counts and file annotations, routine timing/success metadata, and hints for collapsed rows that remain available on expansion.
- **`muted`:** unavailable historical observations and unknown operation details. Missing observations are not reported as execution failures.
- **`warning`:** cancellation, unconfirmed application, unavailable patches/previews, backend or budget omissions, and FFF query/fallback diagnostics.
- **`error`:** reported failures, native nonzero-exit/timeout diagnostics, failed application, and typed MCP errors. Process output preceding a native failure footer retains its own styling.
- **`accent`:** grouped `Read`/`Search`/`List` action labels, invocation-family tool identities, and pending indicators.
- **`syntaxString`:** explicitly tagged search patterns, including every FFF multi-search pattern, in compact, standalone, and expanded summaries. Scope/filter text retains `text`; patterns are not parsed as code or rewritten.
- **`toolTitle`, `text`, and `toolOutput`:** card titles, parameter/reference values, and retained result content respectively. Commands/source retain syntax highlighting; patch additions/removals retain diff colors.

Native and FFF adapters interpret their inspected text envelopes. In retained native shell results, literal process output matching a native placeholder or truncation trailer receives that envelope's styling; the text alone does not establish its provenance. Generic output is not searched for these phrases. Interpretation changes presentation, not retained text, execution outcomes, or session facts.

Live and saved-output previews instead tag generated omissions separately from process text. Identical literal output in those previews retains ordinary styling.

## Diff viewer

Mixed patches use side-by-side columns when space permits; narrow terminals and one-sided patches use unified rows. Write cards omit counts for one-sided patches, while edit cards retain them. Compact previews prioritize changed code and nearby context, with omission hints for excerpts and remaining hunks.

Pi's whole-card expansion action reveals **every retained hunk** with full wrapping. Hunks have no separate input controls. Added/removed rows and inline changes use Pi's theme colors; context and separators retain the terminal background.

Only retained patch context is available; rendering never reads current files. Invalid, incomplete, multi-file, and oversized patches display an unavailable notice. A valid displayed patch suppresses observation-budget warnings, including in retained history. See [resource limits](../README.md#resource-limits) for patch generation and retention bounds.

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

Transcript coordination belongs to the automatic CLI integration and has no public binding or coordinator constructor. Images have a [live finalization limitation](validation.md#platform-limitations).

Native contracts use `path`, read `offset`/`limit`, search `pattern`/scope, shell `command`/`timeout`, and successful edit **`details.patch` in unified format**. Numbered `details.diff` is not interpreted. Write arguments alone do not establish creation, previous contents, or a successful change.

Adapters have:

- `id`: stable contract identifier. `pi:*`, `fff:*`, and `generic` are reserved by this package.
- `family`: `read`, `search`, `list`, `shell`, `edit`, `write`, or `invocation`.
- `supports(args, result)`: optionally validate retained data for the automatic CLI integration. Returning `false` uses generic rendering and removes the call from exploration groups; a later supported result restores the adapter. Omission accepts the result. This callback runs only once a result exists, including partial updates; it does not change the selected adapter or retained data. Standalone factories use their explicitly supplied adapter directly.
- `headingVerbs(args)`: optionally return a `[pending, complete]` pair to override action wording for supplied arguments. Omission or `undefined` uses the family's verbs. Cancellation and unavailable outcomes still take precedence; result presentation is unchanged.
- `invocation(args)`: optionally supply header `InvocationPart[]` (`value`, `path`, `pattern`, `annotation`, or `parameters`, each with `text`) when arguments differ from the family's native shape. The FFF multi-search adapter uses this for `patterns` and `constraints`. Use `path` for a concrete file target, `pattern` for a highlighted search pattern, and `value` for other literal text or filter expressions. Paths are formatted against Pi's render cwd; adapter callbacks still receive the original arguments. Parts follow parameter visibility and semantic styling; the type is exported from `pi-tool-display/adapters`.
- `exploration(args, result?)`: optional ordered `{ label: "Read" | "Search" | "List", parts: InvocationPart[] }` items for the automatic CLI integration; return `undefined` or an empty array when the contract is unavailable. Result updates can remove or restore a call's group membership without changing source order.
- `patch: true`: interpret successful `details.patch` as a bounded unified patch.
- `savedOutput: true`: declare `details.fullOutputPath` meaningful to the automatic CLI integration. The standalone factory does not load files.
- `notices(result, expanded)`: return `DisplayNotice[]` with explicit semantics: `{ kind: "info" | "unavailable" | "warning" | "error", text }` or `{ kind: "reference", label, value }`. `info` uses `dim`; `unavailable` uses `muted`. Keep actionable diagnostics in compact groups and reserve routine counts for expansion.
- `textParts(text, args, context)`: optionally separate a known result envelope into `ResultTextPart[]` (`output`, `value`, `annotation`, `warning`, or `error`). Preserve result content; only explicitly recognized routine metadata may be omitted from presentation. Returning an empty array suppresses the text block without an empty-output placeholder. The retained result remains unchanged. The context supplies `isError`, `isPartial`, and whether the result contains images; do not infer facts from ordinary output. These types are exported from `pi-tool-display/adapters`.
- `imageCaptionMimeType(text)`: optionally identify the MIME type described by a known text caption. For complete successful results, a matching adjacent image omits its redundant generated fallback label. The caption text and Pi-owned image remain unchanged.
- `mcp(args, result?)`: supply the typed facts below.

`officialFffAdapter(toolInfo)` checks official FFF ownership and required schema/result shapes, including recognized FFF-owned override names. It neither enables disabled FFF tools nor calls the search engine. See [adapter development](adapters.md) for automatic selection and adding another provider contract.

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
