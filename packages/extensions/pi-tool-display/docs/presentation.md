# Tool card presentation

[Usage and settings](../README.md) · [Renderer integration](renderers.md)

## Card layout

File targets inside Pi's rendering working directory use relative paths in summaries. Targets outside it use absolute paths. The working directory itself displays as `.`. Grouped reads retain directory names and read ranges.

Paths are resolved lexically, including home expansion, without inspecting current files or following symlinks. Raw parameter blocks, retained output, generic arguments, and literal scope or filter expressions are not rewritten.

Collapsed invocation and command summaries show up to three detail rows, with an expansion hint when truncated. A long invocation can place its action title on a separate row. Grouped exploration summaries use the same limits per item without hiding diagnostics or images.

Expansion removes the [heading preview limits](#resource-limits). Parameter visibility still follows [`showParameters`](../README.md#configuration).

After a successful read completes, its body stays hidden until expansion. Notices and images remain visible. Other collapsed text bodies show initial and final output. Above the [formatting limit](#resource-limits), they show bounded head and tail excerpts with `… more output`. Excerpts preserve whole graphemes and ANSI styling.

Expansion shows all retained output, subject to live and saved-output retention limits.

Exploration groups keep every call in source order, including repeated reads. Visible assistant content, diagnostics, cache-miss notices, compaction summaries and notices, and rendered custom entries separate groups. Hidden content does not. Assistant content separates groups before that message's tools, even if it arrives later.

Tool-result notices and failure diagnostics stay immediately beneath their call:

```text
• Explored
  ├ Read screenshot.png
  │   [Image: image/png]
  ├ Search renderers in src/
  │   [0 exact matches. Maybe you meant this?]
  └ Read renderers.ts
```

## Outcomes

Pending headings cover argument streaming, queueing, and execution. They do not confirm that execution has started or a change has been applied. Adapters can establish an outcome only from completed results.

Headings retain the action when a call fails, is cancelled, or has no known historical outcome: `Write failed`, `Edit cancelled`, or `Read outcome unavailable`. Completed exploration groups count failures, cancellations, and unavailable outcomes. Each affected member also names its outcome.

Confirmed cancellation takes precedence over failure. Successful or unavailable adapter metadata cannot override either.

When cancellation is confirmed, compact native cards omit exact matches for known cancellation messages but retain process output and additional diagnostics. Expansion restores the original diagnostic. Ordinary output and similar messages without confirmed cancellation remain visible.

## Notices and colors

Routine metadata and expansion hints use `dim`. Unknown historical observations use `muted`, not failure styling. Cancellation diagnostics use `warning` in compact cards, expanded cards, and exploration groups. Unavailable patches or previews, output omissions, and actionable diagnostics also use `warning`. Reported failures use `error`.

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
| Collapsed heading formatting | 16,384 UTF-16 code units of normalized text per invocation or exploration item, before styling and wrapping.                                                                                                |
| Collapsed result formatting  | 16,384 UTF-16 code units of styled text, split between the start and end, plus carried ANSI state.                                                                                                          |
| Syntax highlighting          | 512 KiB per text. Code highlighting also stops above 10,000 lines or 4,096 bytes on any line. Text remains readable without token styling.                                                                  |
| Live shell output            | Full output up to 1 MiB. Above that, the first 50 and last 50 completed lines plus any partial line, retaining up to 10,280 source bytes per line.                                                          |
| Saved-output preview         | Read at most 256 KiB total, split between the start and end of oversized files. Retain up to 4,000 preview lines before inserting a line-omission notice. At most 8 cached previews and 8 concurrent reads. |
| Generated patch input        | 64 KiB per text, a 50 ms timeout checked during synchronous generation, and a 2,000 changed-line edit-distance limit. Native edit patches bypass these input and search limits.                             |
| Retained patch               | 128 KiB.                                                                                                                                                                                                    |

The [automatic integration](../README.md#observation-and-saved-history) collects live and saved output and generates patches. The [standalone factory](renderers.md) formats supplied data without observing tools or loading files.
