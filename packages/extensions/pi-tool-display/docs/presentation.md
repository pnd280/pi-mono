# Tool card presentation

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

## Assistant prose

Each visible assistant text block starts with `•`, with continuation rows indented two columns. This replaces Pi's outer prose padding in every output mode, during streaming and replay. Markdown, code blocks, links, and registered transformers remain native; source messages are unchanged. User messages, thinking, and generated diagnostics retain their existing presentation.

## Card layout

Collapsed cards and group headings use `•`; expanded cards use `▾`. Pending markers flash on and off without shifting the heading. [Standalone renderers](renderers.md) keep pending markers visible. Summary lines have no leading marker.

Standalone/expanded targets show descendants relative to Pi's rendering cwd, cwd as `.`, and other paths as absolute. Resolution is lexical, including home expansion, without filesystem inspection or symlink following. Native and selective-read targets first apply Pi's Unicode-space normalization across headings, grouping, and summary identities; custom paths do not. Raw parameters, retained output, generic arguments, and literal scopes/filters stay unchanged.

Targets wrap beneath themselves in normal foreground; ranges/annotations use `dim`. Literal line breaks in paths become separate indented rows. Wrapping prefers path separators and keeps ranges together when they fit. With at least four target columns, wrapping has no row limit; collapsed targets over the [formatting limit](#resource-limits) retain start/end around `…`.

Other collapsed summaries, commands, and narrower targets show up to three detail rows with truncation hints. Long invocations may put the action on its own row. Groups apply these rules per member; diagnostics/images remain visible.

Expansion removes [heading preview limits](#resource-limits), but parameters hidden by [`showParameters`](../README.md#configuration) stay hidden.

### Results

Validated metadata can replace successful text with compact summaries; otherwise cards use bounded previews, grouped or standalone. See [FFF](../src/adapters/@ff-labs/pi-fff/README.md#display), [Todo](../src/adapters/pi-todo/README.md#display), and [MCP scripts](../src/adapters/pi-mcp-adapter/README.md#display).

Observed shells show status/duration beside previews. Successful reads hide text until expansion; edits/writes show diffs. Failure/cancellation output, notices, and images stay visible.

Consecutive text blocks in one result share a single preview, so output split across blocks shows one omission. Previews retain initial/final rows, whole graphemes, and ANSI styling; exceeding [formatting limits](#resource-limits) adds `… more output`. Shell cards omit trailing blank output rows without changing internal blank lines or stored output. Expansion shows summaries and retained output within live/saved retention limits.

## Groups

Adjacent exploration calls group by scope and custom title in source order, including repeated reads. Scope or title changes start new groups even on returning to an earlier directory. Single calls stay standalone; adapters may give one literal-filter scope a [custom title](renderers.md#exploration-scopes).

Live and historical matching rules:

- Native reads use parent directories; native searches/lists use supplied directories, defaulting to `.`. Compare lexical paths against session cwd using summary path rules.
- Literal filters, including FFF scopes, match exactly and never match directories.
- Every item in a call must resolve to the same directory or filter; missing/invalid scopes prevent grouping.

Directory headings use `Exploring`/`Explored <path>`; filter headings use `Filtering`/`Filtered <filter>`. Omit scope-kind nouns and call/operation counts.

Collapsed directory members retain ranges and use paths relative to the group, absolute outside it. FFF members show patterns or `files`, not repeated filters. Expanded/standalone cards follow [target rules](#card-layout) and retain filters. Known queued/executing members show `queued`/`running` in `dim`; argument streaming does not imply execution.

Visible assistant content/diagnostics, cache-miss notices, compaction summaries/notices, custom entries, and non-exploration tools separate groups; hidden content does not. Groups appear in compact and verbose modes; [summary mode](#summary-mode) counts their members within runs. Assistant content is a boundary before its message's tools even if it arrives later.

Public extension notifications (`ctx.ui.notify`) separate groups and runs only when Pi inserts visible components, for all notification severities. No-op notifications and Pi's thinking-toggle status messages create no boundary.

Notices, images, and failure diagnostics stay beneath their call:

```text
• Explored .
  ├ Read screenshot.png
  │   [Image: image/png]
  └ Read renderers.ts
```

Standalone/expanded searches separate pattern and scope with an em dash (U+2014): Searched renderers &#x2014; src/.

## Summary mode

[Summary mode](../README.md#usage) replaces each ended run with one line in its first call's Pi row. A run is a maximal sequence of this extension's calls between unowned visible non-thinking messages, notices/custom entries, or calls using original renderers. Thinking separates visible [exploration groups](#groups), but never splits or settles a run. Single calls form runs, and exploration groups are counted within their run. Compact and verbose modes keep groups and cards unchanged.

[Nested-instruction notices](../src/adapters/pi-nested-instructions/README.md) join the preceding run without splitting or settling it, but remain group boundaries. They contribute separate loaded/updated/removed instruction counts and hide with the run; opening restores them in their original positions. Notices without a preceding owned run stay standalone.

Todo calls stay in their run but are omitted from the line, including incompatible calls using generic fallback: they do not affect counts, and a run of only todo calls without counted notices shows no line.

A run collapses only when no member is streaming, queued, or executing and a non-thinking boundary or agent end prevents more calls from joining. History is always ended. Until then, the run shows compact cards, so its line describes only finished calls. Clicking a card before its run ends keeps the run open afterward, as if its line had been clicked.

Summaries collapse only in Pi's fullscreen mode, without rewriting rows already in terminal scrollback. In regular mode, summary renders as compact, and the mode cycle toggles compact and verbose. Switching Pi's TUI mode re-renders the transcript.

```text
  Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file
```

### Counting

Files and directories count once per category by their lexically resolved path, using [target normalization](#card-layout); other included calls count once, so a command run twice counts twice. A file read and then edited counts in both items. Writes that observably created a file count as created; modifications and writes without a recorded change count as edited.

Only the latest outcome per file or directory counts: a later successful edit clears an earlier failed one. Items with unresolved calls append `(n failed)` or `(n cancelled)` in `error` and unknown historical outcomes `(n unavailable)` in `muted`.

The built-in categories cover creations, edits, shell commands, MCP calls, searches, listings, reads, and unmatched tool names. See [summary wording](../src/summary/categories.ts) for the current labels.

Pi's built-in [codemode](../src/adapters/builtin/codemode/README.md#summary-mode) counts each script once as `ran 1 script`; nested calls never count.

Pi's built-in [tool search](../src/adapters/builtin/tool-search/README.md#summary-mode) adds a loaded-tools category, deduplicated by tool name across the run. Calls without valid nonempty loaded-name details count individually as `tool_search`.

[Instruction notices](../src/adapters/pi-nested-instructions/README.md#display) count once per persisted file path and action, or directory for removals. Their counts remain separate from tool outcomes and file-read counts.

Items appear in the order of their category's first call or notice; failures never reorder them. The first item starts with a capital letter unless it begins with a tool name, which keeps its case. Adapter-declared count labels become single-line terminal-safe text without changing category identities or counts.

### Line layout

The line has no leading marker. Each row has a two-column indent; wrapping occurs only between items, with no row limit. Items wider than the line truncate. Card colors apply: a leading verb uses `accent` (bold for the first item), counts use `text`, other words use `muted`, and separators use `dim`. Failed and cancelled counts use `error`; unavailable counts use `muted`. Error text appears only in opened runs.

Image-bearing calls and failed/cancelled calls contribute to counts; their images and diagnostic text remain hidden.

Left clicks on a summary line open the run to compact cards, where group and card clicks work as usual. An opened run that has ended has plain full-width `dim` horizontal rules above its first card and below its last card or trailing instruction notice, including any images. One blank row separates the content from each rule; the rules have no label or triangle marker. Clicking either rule or its inner padding restores the summary line without toggling a card. Single-card runs have both controls too. Runs whose line would be empty, such as todo-only runs without counted notices, show no collapse controls. Any mode change, including a TUI mode switch, closes opened runs. Transcript search cannot find hidden output.

## Thinking

Collapsed thinking (default **Ctrl+T**) hides a placeholder when all blocks in its consecutive thinking run emit `thinking_end`, even while the assistant message continues streaming text or tool calls. Active thinking stays visible. Message completion also hides any remaining collapsed placeholders, including history. Revealing restores rows/group boundaries without changing run membership, settlement, or the user's opened-run state. A tools → thinking → more tools sequence stays compact until a non-thinking boundary or agent end, regardless of thinking visibility. Live indicators, assistant text, and diagnostics remain; recorded messages never change.

## Outcomes

Pending covers argument streaming, queueing, and execution, not proof of execution or applied changes. Adapter outcomes require completed results. Failed/cancelled/unknown-history headings retain actions: `Write failed`, `Edit cancelled`, `Read outcome unavailable`.

Groups count failures, cancellations, and unavailable outcomes, not pending calls. [Summary lines](#counting) count only the latest outcome per identity. Members name their outcomes; counts stay beside the group action/custom title and wrap rather than truncate at narrow widths. Scopes wrap beneath when necessary.

The CLI records cancellation for unsuccessful execution results arriving after live abort. Earlier failures and successful results retain their outcomes. Cancellation outranks failure; success/unavailable metadata overrides neither.

Confirmed cancellation lets compact native cards omit exact known cancellation messages while retaining process output and extra diagnostics. Expansion restores full diagnostics. Similar ordinary output without confirmation stays visible.

## Notices and colors

Severity changes styling, never visibility; compact groups retain informational notices. Failures and diagnostic bodies use error styling, cancellations and actionable limitations use warning, and unavailable historical facts use muted styling. Live/saved previews distinguish generated omissions from identical process text, which keeps ordinary styling. Generic output is not searched for extension phrases. See [adapter provenance limits](adapters.md#built-in-adapters).

## Diff viewer

Mixed patches use side-by-side columns when wide enough; narrow or one-sided patches use unified rows. Writes omit one-sided counts; edits retain them. Compact previews prioritize changed code/nearby context and mark omitted excerpts/hunks.

Pi expansion reveals all retained hunks with full wrapping; no hunk-specific controls. Added/removed rows and inline changes use theme colors; context/separators retain terminal background.

Only retained context is shown; current files are never read. Invalid, incomplete, multi-file, or oversized patches show unavailable notices. When no usable patch remains, published output stays visible alongside the notice, with a compact preview or expanded retained content. A valid observed patch remains available when result middleware supplies an invalid replacement. Valid patches suppress observation-limit warnings, including history. See [limits](#resource-limits).

## Saved-output previews

Expansion asynchronously reads saved shell output after completion, deferring running calls. Collapsed cards never start reads. Failures retain Pi's published result beside previews; missing, unreadable, changing, or nonregular files retain output with a limitation notice.

When read slots are full, collapse/expand to retry; the loading-limit notice clears when a retry starts. Completed reads, including failures, cache until eviction or transcript disposal. After repairing a file, `/reload` and expand to retry a cached failure; toggling alone reuses it.

A changed saved-output path or cache eviction discards the old preview. Late reads cannot restore previews for obsolete paths, evicted values, or disposed transcripts. Re-expansion can load an evicted preview again.

## Resource limits

Limits affect display, not execution or Pi's saved arguments/results. Collapsed output previews retain the head and tail; source-code previews retain the first rows, and nested-call lists retain the latest calls. Expansion restores only what Pi retained or what the bounded observation captured. Oversized highlighting falls back to readable unstyled text, and patch generation runs off the UI thread under [shared worker limits](../../../libs/src/bounded-diff/README.md#behavior). Exceeded limits make patches unavailable, not edits/writes unsuccessful. Persisted fact size includes unknown fields, so an oversized record is not replayable.

Compact invocation values, patterns, and source-code previews are bounded before terminal normalization. Generic parameter previews also bound JSON serialization by text size, visited values, and nesting depth; an incomplete preview shows a `more details` notice. Expansion serializes the full retained arguments. Unchanged redraws reuse decorated assistant prose, run summaries, and heading layout; animation changes only the heading marker.

For current budgets see [parameter previews](../src/invocation.ts), [heading previews](../src/rendering/headings.ts), [target layout](../src/rendering/target-layout.ts), [preview formatting](../src/rendering/format.ts), [shell observation](../src/observation/), [saved previews](../src/transcript/session.ts), [patch limits](../src/diff.ts), and [record validation](../src/transcript/metadata.ts). [Automatic integration](../README.md#observation-and-saved-history) collects output/generates patches; the [standalone factory](renderers.md) only formats supplied data.
