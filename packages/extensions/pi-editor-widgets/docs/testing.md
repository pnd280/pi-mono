# Editor-widget test coverage

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage) · [Compatibility](pi-compatibility.md)

This package tests settings trust and writes, layout menu state, and editor focus. Libs owns settings-file writes, the shared settings frame, and the [interactive host fixture](../../../libs/src/validation/interactive-host/README.md). Changes to settings writes also need `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

## Must not regress

- **Critical, integration:** Untrusted project settings are ignored, and project saves are refused at the settings boundary.
- **Critical, e2e:** Only an explicit **Ctrl+S** save in `/widgets` writes layout settings. Opening the menu, previewing edits, and clicking usage widgets leave settings files unchanged.
- **High, e2e:** Closing a mounted menu explicitly or through host cancellation restores the effective saved layout in regular and fullscreen modes. Closing after a global save reapplies any saved project layout instead of keeping the global preview.
- **High, e2e:** Registration changes do not retarget nested edits to another row, including when input arrives before another render. Losing the target returns the menu to the row list without applying the stale input.
- **High, unit:** Updating saved-global inheritance preserves the intended nested row, including duplicate row occurrences, or returns to the row list if that row no longer matches.
- **High, unit:** Removing one copy does not hide the contribution while another placement remains.
- **High, e2e:** When the editor has focus, clicking a token or context widget in fullscreen mode keeps subsequent typing in the editor.

## Not tested

- Token and context widget formatting, mouse toggling, shared-row wrapping and padding, mouse dispatch, region clipping, the above-editor blank line, menu hints and scope markers, and save-feedback text and timing: below the severity bar. Use the manual checks.
- Refusal to overwrite malformed or oversized settings files: owned by the libs [settings-file](../../../libs/src/settings-file/README.md) tests. This package tests only its own section check.
- The interactive session picker and physical-terminal behaviour: not driven by the host fixture.

## Manual checks

Setup: workspace Pi with this extension and a native widget contributor such as `pi-todo`. The menu needs no model call.

### Menu

| Do                                                                                          | Expect                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open `/widgets` in regular and fullscreen modes; resize while editing                       | The menu is not an overlay. Selection, drafts, and controls keep working. The editor has focus after closing.                                        |
| Make edits                                                                                  | They show in the real regions without another live widget instance. Regions stay visible when there's room.                                          |
| Close without saving                                                                        | The saved layout is restored.                                                                                                                        |
| Reorder, hide, re-add, and copy widgets with **a**; click each copy of a mouse-aware widget | Every copy responds.                                                                                                                                 |
| Leave rows and regions empty; include unavailable saved IDs; register widgets while editing | One blank line separates chat from the above-editor region, even when all its widgets are empty. New registrations don't change the selected widget. |
| Change a native placement while a nested row is open                                        | The nested row keeps its identity, or the menu returns to the row list without applying stale input.                                                 |

### Layout and scopes

Setup: check at 80×24 and 40×10, in dark and light themes.

| Do                                    | Expect                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Narrow the terminal                   | Footer rows wrap whole fields in order rather than squeezing them into columns. Widening restores shared rows.                     |
| Look over the menu                    | Active-scope highlight, unset and changed markers, path and overflow labels, bounded navigation, and save and exit hints all show. |
| Save an unchanged scope that is unset | The override is created.                                                                                                           |
| Edit global and project drafts        | They stay independent, and inheritance runs one way from global to project. A global save doesn't move inherited nested edits.     |
| Choose "Reset to defaults"            | The default layout previews immediately. Settings stay unchanged until **Ctrl+S**.                                                 |

### Save failures

Setup: hold a settings lock, or make the settings file malformed JSON.

| Do                                          | Expect                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Save                                        | Edits are kept, the selected target and recovery message stay visible, and **Ctrl+S** retries.    |
| Watch notifications                         | Load and save warnings never show as success or appear twice.                                     |
| Wait, edit, or switch scope after a success | Success clears after three seconds, an edit, or a scope change. Warnings and errors don't expire. |
| Fix the file and reopen                     | Load warnings clear.                                                                              |

### Images

Setup: widgets with native `Image` output, in a Kitty terminal and an iTerm2 terminal. The expected results follow the [image placement policy](../README.md#usage).

| Do                                                                | Expect                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Place image-only output and a captioned container in shared rows  | Each image widget takes a full-width row. Its neighbours wrap to other lines.     |
| Place one image widget in several regions                         | Every copy shows the complete image, with its payload and blank rows unchanged.   |
| Shrink the terminal until the height limit falls inside the image | Clipping stops before the image widget, and mouse cells match the visible output. |

### Lifecycle

| Do                                                         | Expect                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Run `/reload`, start and resume sessions, switch renderers | Cleanup, registration updates, editor availability, and native mouse interactions all work.   |
| Load a separate custom-footer extension, in both orders    | A conflict diagnostic appears. Disabling the other footer and reloading gives ownership back. |

### Context widget

Setup: a session with known context usage.

| Do                                                                           | Expect                                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Click the context widget in fullscreen                                       | Compact hides the percentage. Verbose shows it with the automatic compaction threshold.     |
| Switch to regular mode, then back                                            | Regular keeps the original percentage and `(auto)`. Fullscreen restores the earlier choice. |
| Click copies in every region and on wrapped rows                             | Every copy updates, and the editor keeps focus.                                             |
| Compare the threshold with Pi's effective model reserve; compact the session | The threshold matches. Usage shows as unknown after compaction.                             |

### Token widget

Setup: a session with known token usage, in fullscreen.

| Do                                 | Expect                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click the token widget             | Compact shows only input and output counts. Verbose restores cache read and write totals, cache-hit percentage, cost, and subscription markers where they apply. |
| Click with copies placed elsewhere | All copies switch together. The context widget's mode and editor focus don't change.                                                                             |
| Switch to regular mode, then back  | Regular keeps the full display. Fullscreen restores the earlier choice.                                                                                          |
