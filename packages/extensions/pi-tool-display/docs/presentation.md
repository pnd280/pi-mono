# Tool card presentation

[pi-tool-display](../README.md) · [Renderer integration](renderers.md)

## Card layout

Standalone and expanded cards show file targets inside Pi's rendering working directory as relative paths. Targets outside it use absolute paths. The working directory itself displays as `.`.

Paths are resolved lexically, including home expansion, without inspecting current files or following symlinks. Raw parameter blocks, retained output, generic arguments, and literal scope or filter expressions are not rewritten.

Paths shown alone or with a read range wrap with continuation lines aligned beneath the target. Paths use the normal foreground color. Ranges and other annotations use `dim`. Wrapping prefers directory and filename separators and keeps a range together when it fits the available width.

When at least four columns remain for a target, it wraps without a row limit. Collapsed targets above the [formatting limit](#resource-limits) retain their start and end, separated by `…`.

Other collapsed invocation and command summaries show up to three detail rows, with an expansion hint when truncated. Targets with fewer than four available columns also use these preview limits. A long invocation can place its action title on a separate row. Grouped summaries follow the same rules per item. Diagnostics and images remain visible.

Expansion removes the [heading preview limits](#resource-limits). Parameter visibility still follows [`showParameters`](../README.md#configuration).

After a successful read completes, its text body stays hidden until expansion. Notices and images remain visible. Other collapsed text bodies show initial and final output. Above the [formatting limit](#resource-limits), they show head and tail excerpts with `… more output`. Excerpts preserve whole graphemes and ANSI styling.

Expansion shows all retained output, subject to live and saved-output retention limits.

### Groups

Adjacent exploration calls with the same scope form a group. Every call stays in source order, including repeated reads. A scope change starts a new group, even when returning to a previously visited directory. Single calls use ordinary cards. Adapters may instead define a [custom group title](renderers.md#exploration-scopes) over one literal filter scope; those groups render as `<title> · N calls`.

Scopes match by these rules in both live and historical views:

- Native reads use the file's parent directory. Native searches and lists use their supplied directory, defaulting to `.`. Directories are compared after lexical resolution against the session working directory, using the same path rules as summaries.
- Literal filters, including FFF scopes, match only identical filters. They never match filesystem directories.
- All exploration items within a call must resolve to the same directory or literal filter. Calls with missing or invalid scopes do not group.

Group headings label the scope as `directory` or `filter`. Directory groups count operations by action, including repeated calls. A count for one action, such as `3 reads`, appears beside the scope when it fits, or on a continuation line. Counts for multiple actions appear on a continuation line. Filter groups omit operation counts. There is no separate total call count.

Collapsed directory members show targets relative to the heading's directory, keeping read ranges. Targets outside that directory remain absolute. Collapsed FFF members show only their patterns or `files`, without repeating `in <filter>`. Expanded and standalone cards use the [target rules](#card-layout) and retain literal filters.

Queued and executing group members show `queued` and `running` annotations in `dim` when their state is known. Argument streaming does not imply execution.

Visible assistant content, assistant diagnostics, cache-miss notices, compaction summaries and notices, rendered custom entries, and non-exploration tools separate groups. Hidden content does not. Assistant content separates groups before that message's tools, even if it arrives later.

Tool-result notices and failure diagnostics stay immediately beneath their call:

```text
• Explored directory . · 2 reads
  ├ Read screenshot.png
  │   [Image: image/png]
  └ Read renderers.ts

• Searched renderers in src/
  └ [0 exact matches. Maybe you meant this?]
```

### Thinking

With Pi's thinking display collapsed (**Ctrl+T** by default), completed thinking placeholders disappear, including in history. Revealing thinking restores its rows and group boundaries. Live thinking indicators, assistant text, and diagnostics remain visible in either state. Recorded messages do not change.

## Outcomes

Pending headings cover argument streaming, queueing, and execution. They do not confirm that execution has started or a change has been applied. Adapters can establish an outcome only from completed results.

Headings retain the action when a call fails, is cancelled, or has no known historical outcome: `Write failed`, `Edit cancelled`, or `Read outcome unavailable`.

Group headings count failures, cancellations, and unavailable outcomes, excluding pending calls. Each affected member also names its outcome. Outcome counts stay beside **Exploring** or **Explored**. When the scope and outcome counts do not fit together, the scope moves to continuation rows beneath them.

The automatic CLI integration records cancellation when an unsuccessful execution result arrives after the live run is aborted. Successful results and failures received before the abort retain their outcomes.

Confirmed cancellation takes precedence over failure. Successful or unavailable adapter metadata cannot override either.

When cancellation is confirmed, compact native cards omit exact matches for known cancellation messages but retain process output and additional diagnostics. Expansion restores the original diagnostic. Ordinary output and similar messages without confirmed cancellation remain visible.

## Notices and colors

Routine metadata and expansion hints use `dim`. Unknown historical observations use `muted`. Cancellation diagnostics, unavailable patches or previews, output omissions, and actionable diagnostics use `warning`.

For failures, markers, grouped action labels, outcome badges, diagnostic bodies, and error notices use `error`. Standalone and expanded action titles retain `toolTitle` styling.

Live and saved-output previews distinguish generated omissions from process text. Identical literal output in those previews retains ordinary styling. Generic output is not searched for extension-specific phrases. See the [built-in adapters](adapters.md#built-in-adapters) for tool-specific interpretation and provenance limits.

## Diff viewer

Mixed patches use side-by-side columns when space permits. Narrow terminals and one-sided patches use unified rows. Write cards omit counts for one-sided patches, while edit cards retain them. Compact previews prioritize changed code and nearby context, with omission hints for excerpts and remaining hunks.

Pi's tool expansion action reveals every retained hunk with full wrapping. Hunks have no separate input controls. Added and removed rows and inline changes use Pi's theme colors. Context and separators retain the terminal background.

The viewer shows only retained patch context and never reads current files. Invalid, incomplete, multi-file, and oversized patches display an unavailable notice. A valid displayed patch suppresses warnings about observation limits, including in retained history. See [resource limits](#resource-limits) for patch generation and retention bounds.

## Saved-output previews

Expanding a shell card starts an asynchronous read of its saved output after the call completes. Expanding a running call defers the read until completion. Collapsed cards do not start reads.

Failed calls retain Pi's published result beside the preview. Missing, unreadable, changing, or non-regular files leave retained output visible with a limitation notice.

If all read slots are occupied, collapse and expand the card again to retry. Completed reads, including failures, remain cached until eviction or session disposal. To retry a cached failure after repairing a file, run `/reload` and expand the card. Collapsing and expanding alone reuses the cached result.

## Resource limits

These limits affect display, not tool execution or the arguments and results saved by Pi. Live and saved-output budgets limit retained output. Generated omission notices add bytes and rows.

| Resource                     | Limit                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collapsed heading formatting | 16,384 UTF-16 code units of normalized text per invocation, group scope, or exploration item, before styling and wrapping.                                                                                  |
| Collapsed result formatting  | 16,384 UTF-16 code units of source text per text block or preview, split equally between the start and end before normalization and styling. Carried ANSI state is additional.                              |
| Syntax highlighting          | 512 KiB per text. Code highlighting also stops above 10,000 lines or 4,096 bytes on any line. Text remains readable without token styling.                                                                  |
| Live shell output            | Full output up to 1 MiB. Above that, the first 50 and last 50 completed lines plus any partial line, retaining up to 10,280 source bytes per line.                                                          |
| Saved-output preview         | Read at most 256 KiB total, split between the start and end of oversized files. Retain up to 4,000 preview lines before inserting a line-omission notice. At most 8 cached previews and 8 concurrent reads. |
| Generated patch input        | 64 KiB per text, a 50 ms timeout checked during synchronous generation, and a 2,000 changed-line edit-distance limit. Native edit patches bypass these input and search limits.                             |
| Retained patch               | 128 KiB.                                                                                                                                                                                                    |

The [automatic integration](../README.md#observation-and-saved-history) collects live and saved output and generates patches. The [standalone factory](renderers.md) formats supplied data without observing tools or loading files.
