# Pi compatibility for maintainers

[pi-prompt-manager](../README.md)

> Last verified against Pi 1.2.0 with package checks and offline API and installed-CLI tests. Not covered: manual terminal checks, including literal-plus launch shortcuts and the search cursor with `showHardwareCursor`, delivery to the native clipboard, and platform checks.

## Upgrade procedure

1. Run the [package, API, CLI, terminal, and platform checks](validation.md). Shared mounting and interaction coverage belongs to [libs TUI](../../../libs/src/tui/README.md#validation).
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

- [ ] [Lifecycle and capture](../src/index.ts): activates only after TUI startup. Input order, capture exclusions, and reload cleanup are kept. Settings and storage aren't touched outside the TUI.
- [ ] [Editor host mapping](../src/index.ts) and [source refusal](../src/manager.ts): pastes are expanded, restoring is safe and neither submits nor adds to history, and concurrent edits are protected.
- [ ] [Search ranking](../src/ranking.ts) retains Pi-compatible fuzzy scores, including Unicode positions and letter/digit transposition fallback. Compare `fuzzyScore` with `fuzzyMatch` in the installed `@earendil-works/pi-tui` (`dist/fuzzy.js`).
- [ ] [Browser](../src/browser.ts): Pi keybindings work, the view remounts at the boundary between 19-row inline and 18-row overlay, cancellation works, and restoring happens only after the final close.
- [ ] [Fullscreen paging](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership): paging the list, preview, or inspection leaves the transcript still, and respects focus in search and dialogs. If routing is unsupported, a warning appears once per opening and the view stays open.

## Limitations

[Native-only clipboard transport](../src/clipboard.ts), private storage, and capture exclusions are deliberate policies. Keep them when considering new host APIs or clipboard helpers.

### Restoring

[Restoring may normalise tabs and line endings](../README.md#restore-text). Revisit lossless editor APIs, as long as terminal safety and the exact stored and copied source are kept.

### New APIs

Compare any new history, browser, clipboard, and storage APIs with the checklist.
