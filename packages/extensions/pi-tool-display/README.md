# pi-tool-display

Borderless tool cards for Pi **0.85.1**, with grouped exploration, native expansion, live activity, and a [git-diff-view](https://github.com/MrWangJustToDo/git-diff-view) diff viewer. Colors and code highlighting follow Pi's active theme, with [dimmed structure and tree-prefixed parameters](docs/renderers.md#card-layout).

## Usage

Adjacent reads/searches/lists share an `Exploring`/`Explored` heading. Each invocation remains a separate tree item in source order, including repeated reads. Its visible notices, images, and failure diagnostics appear directly beneath it, before the next tool. Compact groups retain up to five rows of text per failed or cancelled call; expansion reveals the full retained diagnostics. FFF search patterns use the theme's string color, while search scopes stay neutral. Explicit empty `ffgrep` patterns display as `""`; empty `fffind` patterns display as `List files in <scope>` / `Listed files in <scope>`. Match counts appear only when expanded; routine pagination instructions and page numbers are hidden. Pi's tool expansion action (**Ctrl+O** by default) reveals every original call and available output. Parameter details for native tools and known adapters are hidden by default; command/path/search summaries stay visible. A fullscreen group click expands or collapses its members together. Regular-mode mouse handling stays with the terminal. Standalone and expanded cards retain action headings such as `Editing` throughout argument streaming, queueing, and execution.

File targets in standalone and grouped summaries are relative to the working directory when inside it, and absolute when outside. Grouped reads retain directory names, so `src/file.ts` and `tests/file.ts` remain distinguishable. Raw parameter blocks, retained result text, and FFF filter expressions are unchanged.

Write patches and addition-only (`+n -0`) or deletion-only (`+0 -n`) edits always use numbered unified rows. Edits with both additions and deletions show unlabeled side-by-side columns when each side has at least 40 code columns; narrower terminals use unified rows. These rules apply to both compact and expanded cards. Write cards omit the `+/-` count summary; edit cards retain it. Additions/deletions have theme-colored backgrounds, with stronger inline highlights over syntax colors. Compact previews allow 30 displayed rows of changed code plus surrounding context. Diffs that fit appear in full; larger diffs prioritize the first edit region, with long-line excerpts around changed text and up to two nearby context lines on each side. `Hunk n/N` labels appear only for multi-hunk patches. Raw patch ranges are not displayed. Expansion shows every retained hunk and full wrapped lines. Lines wrap without a separate scroll viewport. See [diff rendering](docs/renderers.md#diff-viewer) for retained-context and comparison limits.

Verified native tools receive specialized cards. Official `@ff-labs/pi-fff` **0.10.6** search tools have an explicit adapter. Other tools receive generic cards unless their owner supplies either renderer slot, in which case the owner's UI is preserved. Missing historical definitions use generic retained-data cards. SDK/tool owners can use the explicit [renderer API](docs/renderers.md). See [adapter development](docs/adapters.md) to add another tool integration.

## Configuration

Use the literal top-level key in Pi's configured global settings or a trusted project's `.pi/settings.json`:

```json
{
  "ext.pi-tool-display": {
    "showParameters": false,
    "rendererOverrides": {
      "search_docs": "generic",
      "bash": "original"
    }
  }
}
```

`showParameters` is a boolean, default **`false`**. Set it to `true` to show parameter blocks when specialized cards are expanded. Generic cards always show their arguments, including tools forced to `generic`; owner-provided renderers remain unchanged. This controls presentation only: full arguments remain available to execution and in session history.

`rendererOverrides` keys are exact tool names. `auto` (the default) selects the coverage above; `generic` uses supplied arguments/results without specialized observation; `original` bypasses this extension's rendering, grouping, and future observation. Overrides do not enable tools or remove existing metadata.

Settings load before history reconstruction and on `/reload`. A trusted project's explicit `showParameters` value replaces the global value; omission inherits. Trusted project renderer overrides replace global entries by tool name; project `auto` resets an inherited override, and an empty map inherits. Untrusted project settings are ignored. An invalid applicable section disables this extension's presentation/observation and reports its source and key. Unavailable tool names are valid. There are no extension-specific environment variables, CLI flags, watchers, or settings writes.

## Observation and saved history

Only participating interactive TUI sessions observe verified native bash/PowerShell/edit/write operations. Pi's factories retain their construction-time settings, middleware, results, cancellation, and mutation ordering. Automatic observation excludes SDK/custom implementations and user `!`/`!!` commands.

Observation adds bounded shell previews, operation timing/outcomes, before-write reads inside Pi's existing mutation queue, and versioned `pi-tool-display.facts` custom session entries. These entries do not enter model context. **Deleted/context lines from overwritten files can remain in session history.** Display failures do not change tool outcomes. Pi's mutation queue does not prevent races with external writers.

Successful native edits reuse Pi's unified patch, retained before result middleware can replace it. Writes and edit attempts without a usable native patch generate one with [`diff` (jsdiff)](https://github.com/kpdecker/jsdiff) from captured before/after text. A usable patch takes precedence over a saved observation-budget warning.

Print, JSON, and RPC execution adds no automatic display observations. Opening those sessions in the TUI reconstructs cards from retained calls/results, without executing tools or animating incomplete history. Unrecorded durations, exact exit codes, write before-states, and lost MCP types remain unavailable.

Expanding shell output loads Pi's existing temporary output files asynchronously; collapsed cards do not start reads. Failed calls retain Pi's published result alongside the saved preview so exit diagnostics and middleware errors stay visible. Missing, unreadable, changing, or non-regular files leave retained output with a limitation notice. If all read slots are occupied, collapse and expand the card again to retry. There is no durable output archive or network access.

Resource limits:

- Live shell output: full through **1 MiB**, then **50 head + 50 tail lines**, with bounded partial lines and **10,280-byte** long-line retention.
- Saved output: **256 KiB / 4,000 lines** per preview, bounded head/tail reads, at most **8** cached previews and **8** in-flight reads.
- Before-state/input for generated patches: **64 KiB** per text. jsdiff uses a cooperative **50 ms** search timeout and a **2,000 changed-line** edit-distance limit. Native edit patches bypass these input/search limits. Larger/binary/unavailable changes do not block the native operation.
- Patches: **128 KiB**; display records: **160 KiB**. Highlighting skips inputs above **512 KiB**.
- One session-owned **600 ms** animation scheduler, active only while known live calls remain. Disposal releases timers, rows, and saved-output work.

## Compatibility and validation

Private integration is isolated in `src/host-integration.ts`: display lookup, transcript/row lifecycle, and native construction before Pi middleware wrapping. The inspected Pi 0.85.1 construction methods are fingerprinted in both its bundled executable and unbundled API because a `builtin` label alone cannot establish factory-closure behavior. Unavailable or previously wrapped construction disables observation with a warning; available retained-data rendering can continue. Disposal restores only hooks/definitions still owned by this extension and preserves later wrappers.

The extension never registers presentation-only tools, changes active selection, edits Pi/dependencies, or adds keybindings. Inline images remain Pi-owned. HTML export and a separate transcript browser are outside this package.

Use the [focused validation commands](../../../docs/development.md#focused-validation) with `pi-tool-display`. See [validation](docs/validation.md) for host checks and recorded limitations.
