# Pi compatibility for maintainers

[pi-prompt-manager](../README.md)

> Last verified against Pi 1.3.0 with package checks and offline API and installed-CLI tests. Not covered: manual terminal checks, including literal-plus launch shortcuts and the search cursor with `showHardwareCursor`; delivery to the native clipboard; and platform checks.

## Upgrade procedure

1. Run the [package, API, CLI, terminal, and platform checks](validation.md). Shared mounting and interaction coverage belongs to [libs TUI](../../../libs/src/tui/README.md#validation).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

Each item is a Pi contract that the extension relies on, with its expected result.

### Lifecycle and capture

The extension starts in [`index.ts`](../src/index.ts). It must not touch settings or storage outside the TUI.

- [ ] Pi emits `session_start` with `ctx.mode` set to `"tui"` only in the interactive TUI, after TUI startup.
- [ ] Print, JSON, and RPC modes emit `session_start` with a different `ctx.mode`, so the extension reads neither settings nor storage.
- [ ] Pi's `input` event marks typed submissions with `source: "interactive"`, and extension-generated input with another source.
- [ ] An [input-chain](../../../libs/src/input-chain/README.md) observer receives the typed text before any chain transform.
- [ ] Pi runs a slash command that an extension handles before it emits `input`, so the command text never reaches capture.
- [ ] On `/reload`, Pi emits `session_shutdown` with reason `reload` before the new `session_start`.

The shutdown revoke then discards queued captures before the new session starts.

### Shortcuts and shutdown

Shortcuts are [lifecycle claims](../../../libs/src/lifecycle/README.md#shortcut-claims) made in the startup handler. The [shutdown phase](../../../libs/src/lifecycle/README.md#shutdown-phase) revoke stops new writes and notifications synchronously, and the cleanup awaits started atomic writes. Every workspace extension whose shutdown handler awaits is a participant, so only an extension from outside the workspace can await before the revoke. The user-visible effect is in [cancellation](storage.md#cancellation).

- [ ] Pi emits `resources_discover` before it sets up extension shortcuts, so claims that the first participant's handler registers work at once.
- [ ] Pi runs `session_shutdown` handlers one after another in load order, so the first participant's handler revokes every participant before any later handler runs.

### Editor

The [editor host mapping](../src/index.ts) and the [source refusal](../src/manager.ts) protect the exact source and the user's concurrent edits.

- [ ] `ctx.ui.getEditorText()` returns the editor text with pastes expanded.
- [ ] `ctx.ui.setEditorText()` replaces the editor text, without submitting it or adding it to Pi's editor history.

### Browser

- [ ] [Search ranking](../src/ranking.ts) `fuzzyScore` gives the same scores as `fuzzyMatch` in the installed `@earendil-works/pi-tui` (`dist/fuzzy.js`), including Unicode positions and the letter/digit transposition fallback.
- [ ] The [browser](../src/browser.ts) actions resolve through Pi's keybinding IDs listed in [action precedence](controls.md#action-precedence).
- [ ] When the terminal shrinks from 19 to 18 rows, the inline browser remounts as an overlay, and back again when it grows, without losing its search or selection.
- [ ] The cancel action closes the browser and returns to the editor, also while a collection loads.
- [ ] Pi restores its inline editor snapshot before the browser host's `afterClose` runs, so restoring happens only after the final close.
- [ ] With [fullscreen input routing](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership), resolved browser actions, including remapped ones, take priority over transcript controls while the inline browser has focus.
- [ ] Search overlays and other focused dialogs receive input instead of the inline browser.
- [ ] When the routing adapter finds missing capabilities, the browser shows the warning described in [fullscreen paging](controls.md#fullscreen-paging) and stays open.
- [ ] Closing an overlay with `done()` hides only that overlay.

## Limitations

[Native-only clipboard transport](../src/clipboard.ts), private storage, and capture exclusions are deliberate policies. Keep them when considering new host APIs or clipboard helpers.

### Restoring

[Restoring may normalise tabs and line endings](../README.md#restore-text). Revisit lossless editor APIs, as long as terminal safety and the exact stored and copied source are kept.

### New APIs

Compare any new history, browser, clipboard, and storage APIs with the checklist.
