# Validation

## Automated checks

```sh
vpr 'pi-tool-display#format' --check
vpr 'pi-tool-display#check'
vpr 'pi-tool-display#test'
```

When changing the shared FFF classifier, also run these tasks for `@pi-mono/utils` and `pi-fff-guard`. See the workspace [verification workflow](../../../../docs/agents/verification.md).

## Terminal procedure

For integration/interaction changes, use disposable working/agent directories and an offline scripted provider issuing real tool calls. Launch the installed **`pi` executable** in both `--tui-mode regular` and `--tui-mode fullscreen`. Directly running `dist/cli.js` does not test the published bundle: extension imports see different method bodies there.

### Grouping and transcript boundaries

- Issue adjacent reads/searches/lists, including `a.ts → b.ts → a.ts`, failures, cancellation, and overlapping calls. Compact summaries must retain source order and repeated reads, show established failure counts, and keep notices beneath their owner. Expansion must retain all calls/results.
- Include visible assistant diagnostics, cache-miss notices, and successful/failed/cancelled compaction. Visible entries must separate headings, spacing, and group expansion in live and replayed transcripts; disabled or suppressed notices must preserve adjacency.
- Include text/thinking arriving after a tool call, an empty failed assistant response, and a length-truncated response. Grouping must follow the visible assistant component before its tool rows.
- Remove streamed text before and after tool calls through finalized-message middleware. Live and replay grouping must agree without losing call/result ownership, expansion, or other visible boundaries.
- Append custom entries during streaming. Visible entries separate groups at their actual insertion position; an entry renderer returning `undefined` must not split groups.

### Expansion, settings, and appearance

- Use the configured global expansion action and fullscreen group clicks on both summaries and diagnostics. Scroll and resize before clicking again; the same group must expand. Check link activation and priority, drag selection, clipboard behavior, wheel scrolling, and the absence of mouse capture in regular mode.
- Check the [card layout](renderers.md#card-layout) in dark/light themes and wide/narrow rows. Include cwd-relative and outside file targets, repeated reads with ranges, nested/escaped JSON arguments, multiple result items, and wrapped parameters. Tree rules must end at the final visible sibling; warnings and diff hunks remain attached continuations.
- Confirm defaults hide native/FFF parameter blocks even after expansion, while summaries, results, and generic arguments remain visible. With FFF multi-search enabled (`PI_FFF_MULTIGREP=1`), expanded summaries must retain all `patterns` and `constraints`.
- Enable `showParameters` and reload. Verify a trusted project's explicit `false` overrides global `true`, while omission inherits. Enabled structured parameters must retain their straight `│` rule through soft wraps only when a visible result follows.
- Compare native empty output, failure/timeout/cancellation diagnostics, failed-change proposals, FFF no-match/count/fallback diagnostics, typed MCP outcomes, and expanded timing/output references against the [semantic colors](renderers.md#semantic-colors). Literal process output resembling a placeholder or status must retain ordinary styling.
- Check real FFF find, grep, and multi-search results before and after reload. Pagination instructions and routine limit/page notices stay hidden in compact and expanded cards; matches and expanded counts remain available. Retained results and model context keep pagination data. Query/fallback warnings remain visible even when their query contains newlines.

### Images

- Include image-bearing grouped siblings with image display enabled and disabled. Supported protocols should display each image once, before the following tool. Unsupported protocols retain an image notice without redundant captions.
- Include non-vision-model and conversion/resize omission warnings, including omissions without an attached image. Warnings must remain beneath the owning compact read and appear once after expansion.
- Check image fallback alongside patches and live/saved-text previews. Account for the [finalized-image limitation](#platform-limitations) when middleware changes result images.

### Observation and saved output

- Exercise streaming output above Pi's retained-result limit, authoritative final replacement, saved-file expansion, and missing/oversized saved output. Failed calls must retain Pi's published diagnostics beside previews; unavailable files must leave retained output visible.
- Reopen a history with more than eight saved-output calls. Expand a late card after earlier reads finish; if capacity was exhausted, collapse and expand again to retry.
- Change published results from success to failure and vice versa through finalized-message middleware. Live and replayed cards must agree, retain applicable failure diagnostics beside observed patches, and keep observed operation outcomes separate. Duration/exit facts must describe observed operations, not command text or preflight time.
- Include BOM-bearing files, split multibyte output, and literal trailing U+FFFD. Decoding must not invent file changes or discard valid output.

### File diffs

- Exercise creation, overwrite, failed edits, and unavailable patches against the [diff viewer rules](renderers.md#diff-viewer). Check addition-only, deletion-only, mixed, and no-op patches in compact and expanded cards. Preserve line markers and application diagnostics, including when a write's one-sided count summary is hidden.
- Resize mixed patches below the 40-content-columns-per-side threshold and back. Include unequal additions/deletions, multiple hunks, missing-final-newline markers, long wrapped lines, tabs, emoji, and combining marks. Row backgrounds and inline highlights must preserve syntax colors in both themes without leaking into separators, empty cells, or subsequent content.
- Include edits in long Markdown context and after long shared line prefixes. Compact mode must show the first actual edit. Check the 30-changed-row boundary with surrounding context, first-hunk previews with remaining-hunk counts, and full wrapping of every retained hunk after expansion. Single-hunk patches have no hunk label; multi-hunk labels omit raw patch ranges.
- Include native one-line edits in files above the 64 KiB observation limit and small overwrites above 1,000 lines but within that byte limit. Usable patches must remain visible without observation-budget warnings.
- Reopen histories after result middleware replaced native results, and histories containing both a valid native patch and an old budget warning. Deliberately change the working files before reopening: retained patches must survive without reading today's files or replaying calls.

### Lifecycle and excluded modes

- Reload twice, create/resume a session, restart, fork, navigate the tree, compact, and remove the extension. Verify current settings/branch selection, native ownership/active tools, historical expansion, and new calls after each change. Inactive/disposed displays must not animate or invalidate a replacement session.
- Create persisted print/JSON/RPC sessions, then reopen each in the TUI. Non-TUI execution must add no automatic display entries. Reconstruction must not replay calls or invent before-states or timing; new interactive calls can collect facts normally.
- Exercise user `!`/`!!` success, failure, cancellation, expansion, and context exclusion. These remain Pi shell cards and never join groups or acquire display observations.

## Platform limitations

Pi **0.85.1** does not update a live native image row when finalized-message middleware adds or removes result images. This also occurs without the extension; reconstructed rows use the finalized images. Pi caches converted images by index, so replacing its result alone does not establish safe image replacement during asynchronous conversion. The extension continues to use Pi's image path.

Visible Kitty/iTerm images, link activation, drag/clipboard behavior, and Windows/PowerShell execution remain unverified. Component tests check no-image and Kitty emission paths, including joined grouped siblings, but emitted protocol sequences do not establish visible image rendering. Real PowerShell validation requires an available `pwsh` backend; portable factory tests do not establish platform execution.

Temporary-output availability, external file races, missing historical facts, and resource limits are documented in the [README](../README.md#observation-and-saved-history).
