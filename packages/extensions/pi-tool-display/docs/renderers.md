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

Pending standalone and expanded cards use `Reading`, `Searching`, `Listing`, `Running`, `Editing`, `Writing`, or `Calling` throughout argument streaming, queueing, and execution. These headings describe the pending call, not confirmation that execution has started or a change has applied. Compact exploration groups use `Exploring`. Completed calls use past-tense headings; cancellation and missing historical outcomes remain `Cancelled` and `Outcome unavailable`.

File targets in read/edit/write and native search/list summaries use paths relative to the rendering context's cwd when inside it, and absolute paths when outside it. The cwd itself displays as `.`. Grouped reads retain directory names and read ranges. Range suffixes such as `:10-11` use `dim` in compact, standalone, and expanded cards, while the file path uses `text`. Resolution is lexical, including home expansion, without inspecting current files or following symlinks. Raw parameter blocks, retained output, generic arguments, and FFF search/filter expressions are not rewritten.

For FFF single-pattern tools, explicit empty strings have dedicated summaries: `ffgrep` shows `Search ""` in compact groups and `Searched "" in .` when expanded; a supplied scope appears after `in` unchanged. Empty `fffind` patterns show `List files in <scope>` / `Listed files in <scope>`, with `.` as the default scope. Missing patterns use `(pattern missing)` in specialized headings and do not qualify for grouping. These labels do not change tool arguments or interpret backend results.

Tree branches represent meaningful items: tool invocations in a compact exploration group, or independent result items within a standalone card. `├` marks an item with a later visible sibling; `└` marks the final sibling under that parent. Continuation lines retain `│` only where a later sibling follows. A nested tree can have several `└` endings at different levels.

Warnings, related diagnostics, references, and routine metadata are continuation lines, not additional branches. A patch's count summary (omitted for writes), all its hunks, omission hints, and application diagnostics form one result item. Adjacent text blocks share an output item; independent images and typed MCP content items retain their order. Call-level notices for multiple independent results continue the card heading rather than attaching to its final resource. A collapsed read with only a notice does not invent a result branch. Native image captions suppress equivalent generated fallback descriptions without dropping model warnings or changing the retained result.

Compact exploration keeps every call in source order, including repeated reads. Notices and failure diagnostics stay immediately beneath their originating invocation:

```text
• Explored
  ├ Read screenshot.png
  │   [Image: image/png]
  ├ Search renderers in src/
  │   [0 exact matches. Maybe you meant this?]
  └ Read renderers.ts
```

Each invocation stays in its own Pi row so native images remain before the following tool. Compact siblings omit Pi's inter-card margin; expansion restores separate cards and their normal spacing. Clicks on summaries or diagnostics use Pi's group expansion routing.

When enabled and expanded, parameter blocks continue the heading with a straight `│` rule through soft wraps when a visible result follows. Without a visible result, they use indentation instead of an unfinished rail:

```text
• Listed files in **/AGENTS.md
  │ {
  │   "pattern": "",
  │   "path": "**/AGENTS.md",
  │   "limit": 10
  │ }
  └ packages/…/AGENTS.md
```

Wrapped generic invocations use the same continuation rule. JSON token styling shares the **512 KiB** highlighting limit; larger arguments remain readable without token styling.

### Semantic colors

- **`dim`:** tree rules, JSON keys/punctuation, generated header annotations, empty/waiting messages (including native `(no output)`), FFF counts and file annotations, routine timing/success metadata, and hints for collapsed rows that remain available on expansion.
- **`muted`:** unavailable historical observations and unknown operation details. Missing observations are not reported as execution failures.
- **`warning`:** cancellation, unconfirmed application, unavailable patches/previews, backend or budget omissions, and FFF query/fallback diagnostics.
- **`error`:** reported failures, native nonzero-exit/timeout diagnostics, failed application, and typed MCP errors. Process output preceding a native failure footer retains its own styling.
- **`accent`:** grouped `Read`/`Search`/`List` action labels, invocation-family tool identities, and pending indicators.
- **`syntaxString`:** explicitly tagged search patterns, including every FFF multi-search pattern, in compact, standalone, and expanded summaries. Scope/filter text retains `text`; patterns are not parsed as code or rewritten.
- **`toolTitle`, `text`, and `toolOutput`:** card titles, parameter/reference values, and retained result content respectively. Commands/source retain syntax highlighting; patch additions/removals retain diff colors.

Native and FFF adapters recognize only their inspected text envelopes. Generic output is not searched for placeholder or error phrases. Interpretation changes presentation, not retained text, execution outcomes, or session facts. Live/saved previews carry ranges for inserted omission notices so identical text printed by a process remains ordinary output; colors are applied only during rendering.

## Diff viewer

`@git-diff-view/core` **0.1.7** supplies unified-patch parsing and inline change ranges. Native edits supply their own patches; observed writes and edit attempts without a usable native patch use [`diff` (jsdiff)](https://github.com/kpdecker/jsdiff) **9.0.0** for generation. A native Pi renderer handles layout, syntax colors, wrapping, and expansion; the React/Ink CLI component is not mounted inside Pi.

Both compact and expanded cards always use **unified order** for write patches, including overwrites, and patches containing only additions (`+n -0`) or only deletions (`+0 -n`), even with retained context. Write cards omit the addition/deletion count summary but retain line-level `+`/`-` markers and application diagnostics. Other patches show **unlabeled side-by-side columns** when both sides have at least **40 content columns** after gutters; narrower terminals use unified order. Replacements align within each change block, never across hunk boundaries, with blank cells for unmatched additions or deletions. Missing-final-newline markers appear below the affected lines.

Compact previews allow **30 displayed rows of changed code**, plus context, hunk labels, and omission hints. A split replacement row counts once; unified removals and additions count separately. A complete diff appears when its changes fit that budget and its body fits **34 rows** (30 plus four context rows). **`Hunk n/N`** labels appear only for multi-hunk patches, in both compact and expanded views, without raw patch ranges or section labels. Larger diffs show the first hunk in full if that fits. Larger first hunks prioritize changed line pairs in source order, then add up to two nearby context lines on each side outside the change budget. Long context lines use single-row excerpts so wrapped paragraphs cannot bury the edits. Internal omissions use `⋮`; the footer aligns with the diff's line-number gutter, identifies excerpts, and counts remaining hunks. Generic head/tail truncation is never applied to patches.

Selected changed lines keep their complete wrapping when it fits the remaining budget. Otherwise, long lines show an excerpt around the first changed grapheme, with ellipses for omitted text. A linear shared-prefix scan locates that edit even when inline comparison exceeds its budget. Expansion shows **every retained hunk**, with complete context and full line wrapping. It follows the same layout rules and uses Pi's existing whole-card expansion action; hunks have no separate input controls.

Added and removed rows use Pi's `toolSuccessBg` and `toolErrorBg` backgrounds, including wrapped continuations and padding. Context rows and unmatched empty cells keep the terminal background. Inline changes use `selectedBg` and bold emphasis over Pi's syntax colors. Each cell resets its styles before the column separator. Comparison runs on terminal-safe text, and emphasis respects complete Unicode graphemes. Each compared line must be shorter than **1,000 UTF-16 code units**; the sum of old-length × new-length comparisons is bounded by **40,000** per patch rendering. Exceeding that budget skips inline emphasis, not source text or the patch itself.

Only retained patch context is available. Rendering never reads current files or fills gaps to a large line number. Invalid, incomplete, multi-file, and oversized patches display an unavailable notice. A valid displayed patch suppresses stale observation-budget warnings, including in retained history. This viewer adds no settings, keybindings, network access, or independent input/scroll handling.

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
- `supports(args, result)`: optionally validate retained data for coordinated hosts. Returning `false` uses generic rendering and removes the call from exploration groups; a later supported result restores the adapter. Omission accepts the result. This callback runs only once a result exists, including partial updates; it does not change the selected adapter or retained data. Standalone factories use their explicitly supplied adapter directly.
- `headingVerbs(args)`: optionally return a `[pending, complete]` pair to override action wording for supplied arguments. Omission or `undefined` uses the family's verbs. Cancellation and unavailable outcomes still take precedence; result presentation is unchanged.
- `invocation(args)`: optionally supply header `InvocationPart[]` (`value`, `path`, `pattern`, `annotation`, or `parameters`, each with `text`) when arguments differ from the family's native shape. The FFF multi-search adapter uses this for `patterns` and `constraints`. Use `path` for a concrete file target, `pattern` for a highlighted search pattern, and `value` for other literal text or filter expressions. Paths are formatted against Pi's render cwd; adapter callbacks still receive the original arguments. Parts follow parameter visibility and semantic styling; the type is exported from `pi-tool-display/adapters`.
- `exploration(args, result?)`: optional ordered `{ label: "Read" | "Search" | "List", parts: InvocationPart[] }` items for coordinated hosts; return `undefined` or an empty array when the contract is unavailable. Result updates can remove or restore a call's group membership without changing source order.
- `patch: true`: interpret successful `details.patch` as a bounded unified patch.
- `savedOutput: true`: declare `details.fullOutputPath` meaningful to a coordinated host. The standalone factory does not load files.
- `notices(result, expanded)`: return `DisplayNotice[]` with explicit semantics: `{ kind: "info" | "unavailable" | "warning" | "error", text }` or `{ kind: "reference", label, value }`. `info` uses `dim`; `unavailable` uses `muted`. Keep actionable diagnostics in compact groups and reserve routine counts for expansion.
- `textParts(text, args, context)`: optionally separate a known result envelope into `ResultTextPart[]` (`output`, `value`, `annotation`, `warning`, or `error`). Preserve result content; only explicitly recognized routine metadata may be omitted from presentation. Returning an empty array suppresses the text block without an empty-output placeholder. The retained result remains unchanged. The context supplies `isError`, `isPartial`, and whether the result contains images; do not infer facts from ordinary output. These types are exported from `pi-tool-display/adapters`.
- `imageCaptionMimeType(text)`: optionally identify the MIME type described by a known text caption. For complete successful results, a matching adjacent image omits its redundant generated fallback label. The caption text and Pi-owned image remain unchanged.
- `mcp(args, result?)`: supply the typed facts below.

The automatic CLI integration also uses `officialFffAdapter(toolInfo)`. It checks current official FFF ownership and required schema/result shapes, including recognized FFF-owned override names. It neither enables disabled FFF tools nor calls the search engine. Historical generic rows adopt the FFF contract when its tools register after reconstruction. Routine FFF pagination instructions, limit hints, and page-number notices are omitted from both compact and expanded cards. Matches remain available on expansion; query/fallback diagnostics remain visible in compact groups. Retained results and model context keep the original pagination data. Generic adapters do not interpret that envelope. `original` bypasses this explicit FFF integration; `generic` bypasses its specialized interpretation.

See [adapter development](adapters.md) for the directory structure, automatic selection order, and adding another provider contract.

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
