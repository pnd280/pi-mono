# Editor-widget test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests its layout settings key and schema, layout menu state, and editor focus; libs owns settings trust and writes, the shared settings frame, and the [interactive host fixture](../../../libs/src/validation/interactive-host/README.md).

## Must not regress

- **Critical, e2e:** Only an explicit **Ctrl+S** save in `/widgets` writes layout settings. Opening the menu, previewing edits, and clicking usage widgets leave settings files unchanged.
- **High, integration:** Saving a layout scope replaces that scope's whole layout, never merging rows or regions. An invalid saved layout falls back to the next scope.
- **High, e2e:** Closing a mounted menu explicitly or through host cancellation restores the effective saved layout in regular and fullscreen modes. Closing after a global save reapplies any saved project layout instead of keeping the global preview.
- **High, e2e:** Registration changes do not retarget nested edits to another row, including when input arrives before another render. Losing the target returns the menu to the row list without applying the stale input.
- **High, unit:** Updating saved-global inheritance preserves the intended nested row, including duplicate row occurrences, or returns to the row list if that row no longer matches.
- **High, unit:** Removing one copy does not hide the contribution while another placement remains.
- **High, e2e:** When the editor has focus, clicking a token or context widget in fullscreen mode keeps subsequent typing in the editor.

## Not tested

- Token and context widget formatting, mouse toggling, shared-row wrapping and padding, mouse dispatch, region clipping, the above-editor blank line, menu hints and scope markers, and save-feedback text and timing: below the severity bar. Use the manual checks.
- Project trust, preservation of unrelated settings, and refusal to overwrite malformed, oversized, or locked settings files: owned by the libs [settings-file](../../../libs/src/settings-file/README.md) tests.
- The interactive session picker and physical-terminal behaviour: not driven by the host fixture.

## Manual checks

Use the maintainer [terminal validation guide](validation.md).
