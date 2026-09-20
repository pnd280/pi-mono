# Tool card presentation

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

## Card layout

Standalone/expanded targets use paths relative to Pi's rendering cwd for descendants, `.` for cwd, and absolute paths otherwise. Resolution is lexical, including home expansion: no filesystem inspection or symlink following. Raw parameters, retained output, generic arguments, and literal scopes/filters stay unchanged.

Targets wrap beneath themselves in normal foreground; ranges/annotations use `dim`. Wrapping prefers path separators and keeps ranges together when they fit. With at least four target columns, wrapping has no row limit; collapsed targets over the [formatting limit](#resource-limits) retain start/end around `…`.

Other collapsed summaries, commands, and narrower targets show up to three detail rows with truncation hints. Long invocations may put the action on its own row. Groups apply these rules per member; diagnostics/images remain visible.

Expansion removes [heading preview limits](#resource-limits), but parameters hidden by [`showParameters`](../README.md#configuration) stay hidden.

### Results

Validated metadata can replace successful text with compact summaries; otherwise cards use bounded previews, grouped or standalone. See [FFF](../src/adapters/@ff-labs/pi-fff/README.md#display), [Todo](../src/adapters/pi-todo/README.md#display), and [MCP scripts](../src/adapters/pi-mcp-adapter/README.md#display).

Observed shells show status/duration beside previews. Successful reads hide text until expansion; edits/writes show diffs. Failure/cancellation output, notices, and images stay visible.

Previews retain initial/final rows, whole graphemes, and ANSI styling; exceeding [formatting limits](#resource-limits) adds `… more output`. Expansion shows summaries and retained output within live/saved retention limits.

## Groups

Adjacent exploration calls group by scope in source order, including repeated reads. Scope changes start new groups even on returning to an earlier directory. Single calls stay standalone; adapters may give one literal-filter scope a [custom title](renderers.md#exploration-scopes).

Live and historical matching rules:

- Native reads use parent directories; native searches/lists use supplied directories, defaulting to `.`. Compare lexical paths against session cwd using summary path rules.
- Literal filters, including FFF scopes, match exactly and never match directories.
- Every item in a call must resolve to the same directory or filter; missing/invalid scopes prevent grouping.

Directory headings use `Exploring`/`Explored <path>`; filter headings use `Filtering`/`Filtered <filter>`. Omit scope-kind nouns and call/operation counts.

Collapsed directory members retain ranges and use paths relative to the group, absolute outside it. FFF members show patterns or `files`, not repeated filters. Expanded/standalone cards follow [target rules](#card-layout) and retain filters. Known queued/executing members show `queued`/`running` in `dim`; argument streaming does not imply execution.

Visible assistant content/diagnostics, cache-miss notices, compaction summaries/notices, custom entries, and non-exploration tools separate groups; hidden content does not. Assistant content precedes its message's tools as a boundary even when arriving later.

Notices, images, and failure diagnostics stay beneath their call:

```text
• Explored .
  ├ Read screenshot.png
  │   [Image: image/png]
  └ Read renderers.ts
```

Standalone/expanded searches separate pattern and scope with an em dash (U+2014): Searched renderers &#x2014; src/.

## Thinking

Collapsed thinking (default **Ctrl+T**) hides completed placeholders, including history. Revealing restores rows/group boundaries. Live indicators, assistant text, and diagnostics remain; recorded messages never change.

## Outcomes

Pending covers argument streaming, queueing, and execution, not proof of execution or applied changes. Adapter outcomes require completed results. Failed/cancelled/unknown-history headings retain actions: `Write failed`, `Edit cancelled`, `Read outcome unavailable`.

Groups count failures, cancellations, and unavailable outcomes, not pending calls. Members name their outcomes; counts stay beside the group action/custom title. Scopes wrap beneath when necessary.

The CLI records cancellation for unsuccessful execution results arriving after live abort. Earlier failures and successful results retain their outcomes. Cancellation outranks failure; success/unavailable metadata overrides neither.

Confirmed cancellation lets compact native cards omit exact known cancellation messages while retaining process output and extra diagnostics. Expansion restores full diagnostics. Similar ordinary output without confirmation stays visible.

## Notices and colors

| Content                                                                                   | Color                                                                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Successful summaries, information, expansion hints                                        | `dim`                                                                                          |
| Unknown historical observations                                                           | `muted`                                                                                        |
| Cancellation diagnostics, unavailable patches/previews, omissions, actionable diagnostics | `warning`                                                                                      |
| Standalone action/marker                                                                  | `accent` neutral/success, `warning` pending, `error` failure/cancellation, `muted` unavailable |
| Group action/marker                                                                       | Shared member action color, or `accent` if mixed                                               |
| Member labels                                                                             | Outcome-specific                                                                               |
| Diagnostic bodies/error notices                                                           | `error`                                                                                        |

Severity changes styling, never visibility; compact groups retain informational notices. Live/saved previews distinguish generated omissions from identical process text, which keeps ordinary styling. Generic output is not searched for extension phrases. See [adapter provenance limits](adapters.md#built-in-adapters).

## Diff viewer

Mixed patches use side-by-side columns when wide enough; narrow or one-sided patches use unified rows. Writes omit one-sided counts; edits retain them. Compact previews prioritize changed code/nearby context and mark omitted excerpts/hunks.

Pi expansion reveals all retained hunks with full wrapping; no hunk-specific controls. Added/removed rows and inline changes use theme colors; context/separators retain terminal background.

Only retained context is shown; current files are never read. Invalid, incomplete, multi-file, or oversized patches show unavailable notices. Valid patches suppress observation-limit warnings, including history. See [limits](#resource-limits).

## Saved-output previews

Expansion asynchronously reads saved shell output after completion, deferring running calls. Collapsed cards never start reads. Failures retain Pi's published result beside previews; missing, unreadable, changing, or nonregular files retain output with a limitation notice.

When read slots are full, collapse/expand to retry. Completed reads, including failures, cache until eviction/session disposal. After repairing a file, `/reload` and expand to retry a cached failure; toggling alone reuses it.

## Resource limits

Limits affect display, not execution or Pi's saved arguments/results. Live/saved budgets bound retained output; omission notices add bytes/rows.

| Resource           | Limit                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapsed headings | 16,384 normalized UTF-16 units per invocation, group scope, or exploration item before styling/wrapping.                                              |
| Collapsed results  | 16,384 source UTF-16 units per block/preview, split equally between start/end before normalization/styling; carried ANSI state is extra.              |
| Highlighting       | 512 KiB per text; code also stops above 10,000 lines or 4,096 bytes per line. Unstyled text remains readable.                                         |
| Live shell output  | Full through 1 MiB; then first/last 50 completed lines plus partial line, at most 10,280 source bytes per line.                                       |
| Saved previews     | Read 256 KiB total, split start/end for oversized files; retain 4,000 lines before omission notice. Eight cached previews and eight concurrent reads. |
| Patch generation   | 8 MiB UTF-8 per snapshot, 50 ms worker dispatch-to-return, 2,000 changed-line edit distance. Native edit patches bypass these limits.                 |
| Retained patches   | 128 KiB.                                                                                                                                              |

Generation runs off the UI thread under [shared worker limits](../../../libs/src/bounded-diff/README.md#behavior); exceeded limits make patches unavailable. [Automatic integration](../README.md#observation-and-saved-history) collects output/generates patches; the [standalone factory](renderers.md) only formats supplied data.
