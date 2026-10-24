# Editor-widget test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests its layout settings key and schema, layout menu state, and editor focus, while libs owns settings trust and writes, the shared settings frame, and the [interactive host fixture](../../../libs/src/validation/interactive-host/README.md). The host tests also assert context-display toggling, one wrapped-row case, above-editor spacing, scope markers, and save-failure feedback as part of the invariants below.

## Must not regress

- **Critical, e2e:** Only an explicit **Ctrl+S** save in `/widgets` writes layout settings, so opening the menu, previewing edits, and clicking usage widgets leave settings files unchanged.
- **High, integration:** Saving a layout scope replaces that scope's whole layout, never merging rows or regions.
- **High, integration:** An invalid saved layout falls back to the next scope.
- **High, e2e:** A failed layout save retains the unsaved draft and the prior saved state. A successful retry commits that draft.
- **High, e2e:** The coordinator preserves native widget ownership through acquisition, footer conflicts, mode switches, shutdown, and reload.
- **High, e2e:** The coordinator releases only its own hooks and components.
- **High, e2e:** A menu cannot save after its coordinator loses ownership.
- **High, e2e:** Closing a mounted menu explicitly or through host cancellation restores the effective saved layout in regular and fullscreen modes, including on the first **Ctrl+C** after a registration change.
- **High, e2e:** Closing after a global save reapplies any saved project layout instead of keeping the global preview.
- **High, e2e:** Registration changes do not retarget nested edits to another row, including when input arrives before another render. Losing the target returns the menu to the row list without applying the stale input.
- **High, unit:** Updating saved-global inheritance preserves the intended nested row, including duplicate row occurrences, or returns to the row list if that row no longer matches.
- **High, unit:** Removing one copy does not hide the contribution while another placement remains.
- **High, e2e:** When the editor has focus, clicking a token or context widget in fullscreen mode keeps subsequent typing in the editor.

## Not tested

- Token-widget formatting, general row wrapping and padding, image rendering, region clipping, menu hints, and save-feedback timing are below the severity bar. The [manual checks](#manual-checks) cover them and mouse behaviour beyond the focus and settings-write scenarios.
- The libs [settings-file](../../../libs/src/settings-file/README.md) tests own project trust, preservation of unrelated settings, and refusal to overwrite malformed, oversized, or locked settings files.
- The interactive session picker and physical-terminal behaviour are not tested because the host fixture does not drive them.

## Manual checks

Use the maintainer [terminal validation guide](validation.md).
