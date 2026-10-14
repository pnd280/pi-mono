# Tool card presentation

[pi-tool-display](../README.md) · [Renderer integration](renderers.md) · [Glossary](../GLOSSARY.md)

This page specifies how cards, groups, and summary lines look and behave. For the user-level overview, start with the [README](../README.md#usage).

## Assistant prose

Each visible assistant text block starts with `•`, and continuation rows are indented two columns. This replaces Pi's outer prose padding in every output mode, both while streaming and on replay.

- Markdown, code blocks, links, and registered transformers stay native. Source messages are unchanged.
- User messages, thinking, and generated diagnostics keep their existing presentation.

## Card layout

Cards share one layout: a heading marker, a target line, and a bounded result area.

### Markers

| Element                         | Marker                                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapsed card or group heading | `•`                                                                                                                                                                                                                          |
| Expanded card                   | `▾`                                                                                                                                                                                                                          |
| Pending card or group           | The marker alternates between `muted` and `dim` every 600 ms and stays visible. [Standalone renderers](renderers.md) keep a steady marker. Pending verbs and labels use `warning`, also in group members and progress cards. |
| Summary line                    | None                                                                                                                                                                                                                         |

### Target paths

Standalone and expanded targets show paths as follows:

- Descendants of Pi's rendering cwd are relative to it, and the cwd itself is `.`.
- Other paths are absolute.
- Historical relative targets resolve against the recorded execution cwd, then follow the same display rules.
- Resolution is lexical, including home expansion. The filesystem is never inspected and symlinks are not followed.
- Native and selective-read targets first apply Pi's Unicode-space normalization, consistently across headings, grouping, and summary identities. Custom paths are not normalized.
- Path display does not change parameters, retained output, generic arguments, or literal scopes and filters. Parameters and generic arguments show the [validated copy of Pi's raw arguments](adapters.md#callback-arguments) when validation against the current tool schema succeeds. Otherwise, they show Pi's raw arguments.

### Wrapping

- Targets wrap beneath themselves in the normal foreground. Ranges and annotations use `dim`.
- A literal line break in a path becomes a separate indented row.
- Wrapping prefers path separators, and keeps a range and annotations, such as a read selection, beside the filename when they fit. Nested-instruction notices wrap their paths the same way.
- With at least four target columns, target wrapping has no row limit. A collapsed target over the [formatting limit](#resource-limits) keeps its start and end around `…`.
- Other collapsed summaries, commands, and narrower targets show up to three detail rows, with truncation hints. A hint never replaces a single row: when only one more row remains, it shows. A long invocation may put its action on its own row.
- Groups apply these rules to each member. Diagnostics and images stay visible.

Expansion removes [heading preview limits](#resource-limits). Parameters hidden by [`showParameters`](../README.md#configuration) stay hidden.

### Results

When validated metadata allows it, successful text is replaced with a compact summary. Otherwise, cards show a bounded preview, grouped or standalone. See [FFF](../src/adapters/@ff-labs/pi-fff/README.md#display), [Todo](../src/adapters/pi-todo/README.md#display), and [MCP scripts](../src/adapters/pi-mcp-adapter/README.md#display) for examples.

| Call                    | Collapsed result                            |
| ----------------------- | ------------------------------------------- |
| Observed shell          | Preview, with status and duration beside it |
| Successful read         | Hidden until expansion                      |
| Edit or write           | Diff                                        |
| Failure or cancellation | Output stays visible                        |
| Notices and images      | Stay visible                                |

Shell status, operation rows, nested calls, and progress cards use one duration format: milliseconds below one second, tenths of a second below one minute, then minutes and seconds, such as `1m 5s`. A running progress timer counts whole seconds.

Preview rules:

- Consecutive text blocks in one result share a single preview, so output split across blocks shows one omission.
- Previews keep the first and last rows, whole graphemes, and ANSI styling. Exceeding the [formatting limits](#resource-limits) adds `… more output`.
- Shell cards drop trailing blank output rows. Internal blank lines and stored output are unchanged.
- Expansion shows summaries and retained output, within the live and saved retention limits.

## Groups

An _exploration group_ is a set of adjacent read, search, or listing calls in the same scope, shown under one heading.

- Calls group by scope and custom title, in source order, including repeated reads.
- A change of scope or title starts a new group, even when returning to an earlier directory.
- A single call stays standalone. Adapters may give one literal-filter scope a [custom title](renderers.md#exploration-scopes).

### Matching scopes

These rules apply live and on replay:

- Native reads use the parent directory. Native searches and listings use the supplied directory, defaulting to `.`. Paths are compared lexically against the session cwd, using the summary path rules.
- Literal filters, including FFF scopes, match exactly and never match a directory.
- Every item in a call must resolve to the same directory or filter. A missing or invalid scope prevents grouping.

### Headings and members

| Scope kind | Headings                             |
| ---------- | ------------------------------------ |
| Directory  | "Exploring" or "Explored" `<path>`   |
| Filter     | "Filtering" or "Filtered" `<filter>` |

Headings never include a scope-kind noun or call and operation counts.

- Collapsed directory members keep their ranges, and use paths relative to the group (absolute outside it).
- FFF members show their pattern or `files`, not the repeated filter.
- Expanded and standalone cards follow the [target rules](#target-paths) and keep filters.
- Known queued and executing members show `queued` or `running` in `dim`. Streaming arguments does not imply execution.

### What separates groups

Separate groups:

- visible assistant content and diagnostics (assistant content separates its message's tools even when it arrives later);
- cache-miss notices, compaction summaries, and compaction notices;
- custom entries and non-exploration tools;
- public extension notifications (`ctx.ui.notify`) of any severity, but only when Pi inserts a visible component.

Do not separate groups: hidden content, no-op notifications, and Pi's thinking-toggle status messages.

Groups appear in `compact` and `verbose` modes. In [summary mode](#summary-mode), their members are counted within their run.

### Notices and images

Notices, images, and failure diagnostics stay beneath their call. Notices follow the result output. Native image previews align with the card body, continue the collapsed group guide, and shrink to fit the remaining width. Images stay inline and have no click action:

```text
• Explored .
  ├ Read screenshot.png
  │   [Image: image/png]
  └ Read renderers.ts
```

Standalone and expanded searches separate pattern and scope with an em dash (U+2014): Searched renderers &#x2014; src/.

## Summary mode

In [summary mode](../README.md#usage), each ended run becomes one line, placed in its first call's Pi row. `compact` and `verbose` modes keep groups and cards unchanged.

```text
  Read 4 files · 2 searches · edited 2 files · ran 3 commands (1 failed) · created 1 file
```

### What a run is

A _run_ is the longest sequence of this extension's calls between visible non-thinking boundaries. These boundaries split runs:

- assistant prose or diagnostics;
- an unrelated visible message, notice, or custom entry;
- a call that uses its original renderer.

Thinking separates exploration groups, but never splits or ends a run. A single call is a run of one. Exploration groups are counted inside their run.

### Notices and todo calls in runs

[Nested-instruction notices](../src/adapters/pi-nested-instructions/README.md) join the preceding run without splitting or ending it, but they still separate groups. They add separate counts for loaded, updated, and removed instructions, hide with the run, and return to their original positions when it opens. A notice with no preceding run stays standalone.

Todo calls stay in their run but are left out of the line, including incompatible calls shown with generic fallback. They don't affect counts. A run of only todo calls, with no counted notices, shows no line.

### When a run collapses

A run collapses only when both are true:

1. No member is streaming, queued, or executing.
2. A non-thinking boundary or the agent's end prevents more calls from joining.

History is always ended. Until a run collapses, it shows compact cards, so its line only ever describes finished calls. Clicking a card before the run ends keeps the run open afterwards, as if you had clicked its line.

Summary lines need Pi's fullscreen mode, and never rewrite rows already in terminal scrollback. In regular mode, `summary` renders as `compact`, and the mode cycle toggles `compact` and `verbose`. Switching Pi's TUI mode re-renders the transcript.

### Counting

Identity

- Files and directories count once per category, by lexically resolved path using [target normalization](#target-paths).
- Other calls count once each, so a command run twice counts twice.
- A file that is read and then edited counts in both categories.
- A write that observably created a file counts as created. Modifications, and writes with no recorded change, count as edited.

Outcomes

- Only the latest outcome per file or directory counts; a later successful edit clears an earlier failed one.
- Items with unresolved calls append `(n failed)` or `(n cancelled)` in `error`, and unknown historical outcomes append `(n unavailable)` in `muted`.

Categories

- Built-in categories cover creations, edits, shell commands, MCP calls, searches, listings, reads, and unmatched tool names. The current labels are in [summary wording](../src/summary/model.ts).
- Pi's built-in [codemode](../src/adapters/builtin/codemode/README.md#summary-mode) counts each script once as `ran 1 script`. Nested calls never count.
- Pi's built-in [tool search](../src/adapters/builtin/tool-search/README.md#summary-mode) adds a loaded-tools category, deduplicated by tool name across the run. Calls without valid, nonempty loaded-name details count individually as `tool_search`.
- [Instruction notices](../src/adapters/pi-nested-instructions/README.md#display) count once per persisted file path and action, or per directory for removals. These counts stay separate from tool outcomes and file-read counts.

Order and wording

- Items appear in the order of their category's first call or notice. Failures never reorder them.
- The first item starts with a capital letter, unless it begins with a tool name, which keeps its case.
- Adapter-declared count labels become single-line terminal-safe text, without changing category identities or counts.

### Line layout

- The line has no leading marker. Each row is indented two columns.
- Wrapping happens only between items, with no row limit. An item wider than the line is truncated.
- Colours: a leading verb uses `accent` (bold for the first item), counts use `text`, other words use `muted`, and separators use `dim`. Failed and cancelled counts use `error`; unavailable counts use `muted`.
- Calls with images, and failed or cancelled calls, add to the counts; their images and diagnostic text stay hidden. Error text appears only in opened runs.
- Transcript search cannot find hidden output.

### Opening and closing a run

1. Left-click a summary line to open the run as compact cards. Group and card clicks work as usual inside it.
2. An opened, ended run has plain full-width `dim` rules above its first card and below its last card or trailing instruction notice, including any images. One blank row separates the content from each rule. The rules have no label or triangle marker.
3. Click either rule or its inner padding to restore the summary line. No card toggles.

Single-card runs have both rules too. Runs whose line would be empty, such as todo-only runs without counted notices, have no collapse controls. Any mode change, including a TUI mode switch, closes opened runs.

## Thinking

With collapsed thinking (default **Ctrl+T**), a placeholder is hidden as soon as every block in its consecutive thinking run has emitted `thinking_end`. This happens even while the assistant message is still streaming text or tool calls.

- Active thinking stays visible.
- Message completion also hides any remaining collapsed placeholders, including in history.
- Revealing thinking restores rows and group boundaries, without changing run membership, settlement, or which runs you opened.
- A tools → thinking → more tools sequence stays compact until a non-thinking boundary or the agent's end, whether thinking is visible or not.
- Live indicators, assistant text, and diagnostics stay. Recorded messages never change.

## Outcomes

Pending covers argument streaming, queueing, and execution. It is not proof that a call ran or changed anything. Adapter outcomes need completed results.

Failed, cancelled, and unknown-history headings keep the action name: `Write failed`, `Edit cancelled`, `Read outcome unavailable`.

- Groups count failures, cancellations, and unavailable outcomes, but not pending calls. [Summary lines](#counting) count only the latest outcome per identity.
- Members name their outcomes. Counts sit beside the group's action or custom title, and wrap rather than truncate at narrow widths. Scopes wrap beneath when needed.

Cancellation:

- The CLI records cancellation for an unsuccessful result that arrives after a live abort. Earlier failures and successful results keep their outcomes.
- Cancellation outranks failure. Success and unavailable metadata override neither.
- Once cancellation is confirmed, compact native cards may omit the exact known cancellation message while keeping process output and extra diagnostics. Expansion restores the full diagnostics. Similar ordinary output without confirmation stays visible.

Local details on replay:

- Expanded native `bash`, `powershell`, `edit`, and `write` cards say why timing and saved-output references are missing: the writer's file is not on this machine, the file has no line for the call, the file exceeds 8 MiB or cannot be read safely, or the call was not observed.
- When the file is not on this machine, shell summaries and operation rows show `Timing not on this machine` in place of the duration.
- Other adapters keep no local details and show no notice.

## Notices and colours

Severity changes styling, never visibility. Compact groups keep informational notices.

| Kind                                     | Style   |
| ---------------------------------------- | ------- |
| Failures and diagnostic bodies           | error   |
| Cancellations and actionable limitations | warning |
| Unavailable historical facts             | muted   |

Headings, group badges, and summary counts name failed and cancelled outcomes in `error`. Status details use `warning` for a cancellation, for example a shell's `Cancelled` row, a progress status, or a nested call.

Live and saved previews distinguish generated omissions from identical process text, which keeps ordinary styling. Generic output is never searched for extension phrases. See [adapter provenance limits](adapters.md#built-in-adapters).

## Diff viewer

Layout

- The diff is a full-width panel below the heading, with no tree connector. The `toolPendingBg` surface covers context rows and separators. Panels wider than two columns have one column of padding on each side.
- The top strip carries counts and warnings. With multiple hunks, its first row also shows the first hunk's position when both fit. Caller text takes priority.
- A strip precedes each later hunk, with its number and, when space permits, its start line.
- The bottom strip carries the omission hint, failure text, notices, and operation row. Nested calls and images follow the complete panel.
- Mixed patches use side-by-side columns when there is room. Narrow or one-sided patches use unified rows.
- Writes omit one-sided counts; edits keep them.
- Compact previews prioritize changed code and nearby context, and mark omitted excerpts and hunks.
- Pi's expansion reveals all retained hunks with full wrapping. There are no per-hunk controls.
- Strips and changed rows tint the surface toward the theme's diff colours. Added-row tints use `toolDiffAdded`, independently of `toolSuccessBg`. Contrast depends on the supplied colours and the terminal's colour mode. Inline changes use `selectedBg`. A changed row's background also covers its padding column.

Unavailable patches

- Only retained context is shown; current files are never read.
- Invalid, incomplete, multi-file, or oversized patches show an unavailable notice. When no usable patch remains, published output stays visible next to the notice, as a compact preview or as expanded retained content.
- A valid observed patch stays available when result middleware supplies an invalid replacement.
- Valid patches suppress observation-limit warnings, including in history. See [limits](#resource-limits).

## Saved-output previews

Reading

- Expansion reads saved shell output asynchronously after the call completes, and defers running calls. Collapsed cards never start reads.
- On failure, Pi's published result stays beside the preview. A missing, unreadable, changing, or non-regular file keeps the output, with a limitation notice.

Retrying

- When read slots are full, collapse and expand to retry. The loading-limit notice clears when a retry starts.
- Completed reads, including failures, are cached until eviction or transcript disposal.
- After repairing a file, run `/reload` and expand to retry a cached failure. Toggling alone reuses the cached failure.

Invalidation

- A changed saved-output path, or cache eviction, discards the old preview.
- Late reads never restore previews for obsolete paths, evicted values, or disposed transcripts.
- Expanding again can reload an evicted preview.

## Resource limits

Limits affect display only, never execution or Pi's saved arguments and results.

What is kept

- Collapsed output previews keep the head and tail. Source-code previews keep the first rows. Nested-call lists keep the latest calls.
- Expansion restores only what Pi retained or what the bounded observation captured.
- Exceeded limits make a patch unavailable; they never make an edit or write unsuccessful.
- Persisted fact size includes unknown fields, so an oversized record cannot be replayed.
- Each local line is limited to 32 KiB. When a writer's header exceeds the limit, its file is not created and its local details stay in memory. An oversized call line is replaced by a diagnostic with bounded fields. Replay does not read a writer's file above 8 MiB, whatever its line sizes.

How work is bounded

- Oversized highlighting falls back to readable unstyled text.
- Patch generation runs off the UI thread under [shared worker limits](../../../libs/src/bounded-diff/README.md#behaviour).
- Compact invocation values, patterns, and source-code previews are bounded before terminal normalization.
- Generic parameter previews also bound JSON serialization by text size, values visited, and nesting depth. An incomplete preview shows a `more details` notice. Expansion serializes all retained arguments: the [validated copy](adapters.md#callback-arguments) when validation succeeds, otherwise Pi's raw arguments.
- Unchanged redraws reuse decorated assistant prose, run summaries, and heading layout. Animation changes only the heading marker.

Current budgets live in the source:

| Budget             | Source                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Parameter previews | [invocation.ts](../src/invocation.ts)                                                                                              |
| Heading previews   | [headings.ts](../src/rendering/headings.ts)                                                                                        |
| Target layout      | [target-layout.ts](../src/rendering/target-layout.ts)                                                                              |
| Preview formatting | [format.ts](../src/rendering/format.ts)                                                                                            |
| Shell observation  | [observation/](../src/observation/)                                                                                                |
| Saved previews     | [observation/saved-output.ts](../src/observation/saved-output.ts), [transcript/saved-output.ts](../src/transcript/saved-output.ts) |
| Patch limits       | [diff.ts](../src/diff.ts)                                                                                                          |
| Record validation  | [metadata.ts](../src/transcript/metadata.ts)                                                                                       |
| Local lines        | [store.ts](../src/transcript/store.ts)                                                                                             |

[Automatic integration](../README.md#what-is-recorded) collects output and generates patches. The [standalone factory](renderers.md) only formats data it is given.
