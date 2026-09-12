# Validation

## Automated checks

Run the affected packages, including both consumers of the shared classifier:

```sh
for package in pi-tool-display pi-fff-guard @pi-mono/utils; do
  vpr "$package#format" --check
  vpr "$package#check"
  vpr "$package#test"
done
```

The colocated suites protect source-ordered grouping, visible-entry boundaries in live/replayed transcripts, expansion, scheduler cleanup, settings/ownership selection, parameter visibility defaults/overrides and adapter transitions, native/FFF prose boundaries, explicit live/saved omission ranges, bounded UTF-8 output, native unified patches, branch/fork/compaction metadata, saved-output capacity retries/disposal, and native execution equivalence. Host tests use real Pi sessions and tool components, including reconstructed reloads, dynamic owners and later execution wrappers, SDK base overrides, opt-outs, non-TUI cleanup, standalone MCP result-derived headings, and native image routing.

## Terminal procedure

Use disposable working/agent directories and an offline scripted provider issuing real tool calls. Launch the installed **`pi` executable** in both `--tui-mode regular` and `--tui-mode fullscreen`. Directly running `dist/cli.js` does not test the published bundle: extension imports see different method bodies there.

- Issue adjacent reads/searches/lists, including `a.ts → b.ts → a.ts`, visible assistant boundaries, failures, cancellation, and overlapping calls. Compact summaries must preserve source order and expose established failure counts; expansion must retain all calls/results.
- Use the configured global expansion action and fullscreen group clicks. Resize and scroll before clicking again. Check dark/light themes, narrow rows, link priority, drag selection, clipboard behavior, wheel scrolling, and the absence of mouse capture in regular mode.
- Confirm that default settings hide native/FFF parameter blocks even after expansion, while summaries, results, and generic arguments remain visible. With FFF multi-search enabled (`PI_FFF_MULTIGREP=1`), check that expanded cards retain all `patterns` and `constraints` in their summaries. Enable `showParameters`, reload, then verify a trusted project's explicit `false` overrides global `true` and omission inherits. With parameters enabled, expand structured parameters and check their straight `│` rules through soft wraps, with `└` at the result or patch summary. Compare dim structure against readable values in both themes; include escaped JSON strings, nested arrays, header annotations, compact omission hints, and failure/timing metadata.
- Compare accented grouped `Read`/`Search`/`List` labels against neutral card titles and dim tree rules in both themes. Compare native empty output, failure/timeout/cancellation diagnostics, failed-change proposals, FFF no-match/count/pagination notices, and typed MCP outcomes against the [semantic color policy](renderers.md#semantic-colors). Check expanded metadata and saved-output references. Literal process output resembling a placeholder/status must retain its ordinary styling.
- Include image-bearing grouped siblings with image display enabled/disabled. Native image protocols should emit each image once; unsupported protocols should retain an image notice without restoring redundant text.
- Exercise streaming output above Pi's retained-result limit, authoritative final replacement, saved-file expansion, missing/oversized saved output, file creation/overwrite, and unavailable/failed diffs. Include BOM-bearing files, split multibyte output, and literal trailing U+FFFD; decoding must not invent file changes or discard valid output. Reopen a history with more than eight saved-output calls; expand a late card after earlier reads finish and confirm its available output loads. Duration/exit facts must describe observed operations, not inferred command text or preflight time.
- Reload twice, create/resume a session, restart, fork, navigate the tree, compact, and remove the extension. Verify current settings/branch selection, native ownership/active tools, historical expansion, and new calls after each change. Inactive/disposed displays must not animate or invalidate a replacement session.
- Create persisted print/JSON/RPC sessions, then reopen each in the TUI. There must be no automatic display entries from non-TUI execution, no replayed calls, and no invented before-states or timing. New interactive calls can collect facts normally.
- Exercise user `!`/`!!` success, failure, cancellation, expansion, and context exclusion. These remain Pi shell cards and never join groups or acquire display observations.

Use a host with the PowerShell backend for real PowerShell execution. Do not equate portable construction checks or emitted image-protocol sequences with platform execution or visible image rendering.

## Platform coverage and remaining gaps

Validation targets Pi **0.85.1** and official FFF **0.10.6**. Recorded Linux tmux coverage includes regular/fullscreen rendering, grouping, expansion, mouse clicks after scrolling/resizing, dark/light themes, parameter settings, FFF searches, native mutations, shell streaming/truncation, saved-output expansion, and lifecycle reconstruction. Offline checks also cover blocking/result middleware, non-TUI sessions, and user `!`/`!!` success, failure, cancellation, and context exclusion.

Visible Kitty/iTerm images, link activation, drag/clipboard behavior, and Windows/PowerShell execution remain unverified. Unsupported-image fallback has tmux coverage; component tests check both no-image and Kitty emission paths, including hidden grouped siblings. Emitted protocol sequences do not establish visible image rendering. Real PowerShell validation requires an available `pwsh` backend.

Inherited limits remain: temporary output files can disappear, external writers can race with Pi's queue, and old sessions cannot recover facts never recorded. Resource budgets and side effects are documented in the [README](../README.md#observation-and-saved-history).
