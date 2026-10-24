# Editor-widget terminal validation for maintainers

[pi-editor-widgets](../README.md) · [Test coverage](testing.md)

Setup: use workspace Pi with this extension and a native widget contributor such as `pi-todo`. The menu needs no model call. For remapping checks, edit Pi's `keybindings.json` and run `/reload` after each change. Restore the original bindings and reload after the checks.

For settings-write changes, also run `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

## Menu

| Do                                                                                                             | Expect                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Open `/widgets` in regular mode, then in fullscreen mode.                                                      | The menu is part of the screen layout, not an overlay.                                                        |
| Resize the terminal while editing.                                                                             | The selection stays on the intended item, and the draft is kept.                                              |
| After resizing, press **a**, **Tab**, and **Shift+Up**.                                                        | **a** and **Shift+Up** act on the selected item, and **Tab** switches the layout scope, as before the resize. |
| Close the menu.                                                                                                | The editor has focus.                                                                                         |
| Make edits while the terminal has enough room.                                                                 | The edits show in the real regions, and the regions stay visible.                                             |
| Look for duplicates of an edited widget.                                                                       | No extra live widget instance is created.                                                                     |
| Close without saving.                                                                                          | The saved layout is restored.                                                                                 |
| Reorder, hide, re-add, and copy widgets with **a**; click each copy of a mouse-aware widget.                   | Every copy responds to its click.                                                                             |
| Leave rows and regions empty, and include unavailable saved IDs.                                               | One blank line separates chat from the above-editor region, even when all its widgets are empty.              |
| Register widgets while editing.                                                                                | New registrations don't change the selected widget.                                                           |
| Change a native placement while a nested row is open.                                                          | The nested row keeps its identity, or the menu returns to the row list without applying stale input.          |
| Open a native row's contents, move its widget to another region, then press **Ctrl+C** before the next render. | The menu closes on the first press and restores the effective saved layout.                                   |
| In fullscreen mode, map `tui.altScreen.pageDown` to **Down**, open `/widgets`, and press **Down**.             | The menu selects the next item without scrolling the transcript.                                              |
| Map `tui.altScreen.pageDown` to **Ctrl+S**, open `/widgets`, and press **Ctrl+S**.                             | The displayed scope is saved without scrolling the transcript.                                                |
| Map `tui.altScreen.pageDown` to **Ctrl+C**, open `/widgets`, and press **Ctrl+C**.                             | The menu closes without scrolling the transcript, and the editor regains focus.                               |
| After closing the menu, press the remapped transcript paging key.                                              | The transcript pages again.                                                                                   |

## Layout and scopes

Setup: check at 80×24 and 40×10, in dark and light themes.

| Do                                                                            | Expect                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Narrow the terminal, then widen it again.                                     | Footer rows wrap whole fields in order rather than squeezing them into columns. Shared rows return when the terminal is wide again. |
| Find the active scope, an unset scope, and a changed scope in the menu.       | The active scope is highlighted. The unset and changed scopes each show their marker.                                               |
| Look at the menu at 80×24, then at 40×10.                                     | At 80×24 the settings path is visible. At 40×10 it is hidden; it shows only when the menu area is at least 60 columns by 18 rows.   |
| Open a list that is longer than the menu, and navigate to its end.            | `(selected/total)` shows below the last visible item, and the selection stays within the menu.                                      |
| Read the hint footer.                                                         | It shows the save and exit keys.                                                                                                    |
| Save an unchanged scope that is unset.                                        | The settings file gets an explicit layout for that scope.                                                                           |
| Edit global and project drafts, then inspect inherited values in both scopes. | The drafts stay independent. Inheritance runs one way, from global to project.                                                      |
| Save a global draft, then return to the inherited nested row.                 | The save doesn't move the inherited nested edits.                                                                                   |
| Choose "Reset to defaults", then inspect the settings file.                   | The default layout previews immediately. The settings file is unchanged until **Ctrl+S**.                                           |

## Save failures

Setup: hold a settings lock, or make the settings file malformed JSON.

| Do                                                          | Expect                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Save.                                                       | Edits are kept, the selected target stays visible, and the recovery message stays visible. |
| Press **Ctrl+S** again.                                     | The save is retried.                                                                       |
| Read the menu feedback for one load or save failure.        | The failure appears as a warning or error, never as success.                               |
| After a success, wait three seconds, edit, or switch scope. | Each one clears the success message.                                                       |
| Wait after a warning or error.                              | The warning or error doesn't expire.                                                       |
| Fix the file and reopen.                                    | Load warnings clear.                                                                       |

## Images

Setup: use widgets with native `Image` output, in a Kitty terminal and an iTerm2 terminal. The expected results follow the [image placement policy](settings.md#how-rows-render).

| Do                                                                 | Expect                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Place image-only output and a captioned container in shared rows.  | Each image widget takes a full-width row, and its neighbours wrap to other lines.     |
| Place one image widget in several regions.                         | Every copy preserves the complete image output, including its payload and blank rows. |
| Shrink the terminal until the height limit falls inside the image. | Clipping stops before the image widget.                                               |
| Click the visible widgets after shrinking.                         | Mouse cells match the visible output.                                                 |

## Lifecycle

Setup: run `/reload`, a new session, a resumed session, and a renderer switch, and do the first three checks after each one.

| Do                                                                   | Expect                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Inspect the widget regions.                                          | Only currently registered widgets show.                                                     |
| Type in the editor.                                                  | The text appears in the editor.                                                             |
| In fullscreen mode, click a mouse-aware widget and the token widget. | Each responds to the click. The token widget switches between compact and detailed display. |
| Load a separate custom-footer extension, in both orders.             | A footer-conflict warning appears.                                                          |
| Disable the other footer extension and reload.                       | This extension's footer layout shows again.                                                 |

## Context widget

Setup: start Pi in fullscreen with a session that has known context usage and automatic compaction enabled. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                                           | Expect                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Inspect the context widget before clicking it.               | The percentage is hidden.                                                                                 |
| Click the context widget.                                    | The percentage shows with the automatic compaction threshold, which matches Pi's effective model reserve. |
| Switch to regular mode, then back to fullscreen.             | Regular mode shows the original percentage with `(auto)`. Fullscreen restores the earlier choice.         |
| Click copies in every region and on wrapped rows, then type. | Every copy updates, and the text goes to the editor.                                                      |
| Compact the session.                                         | Usage shows as unknown.                                                                                   |

## Token widget

Setup: start Pi in fullscreen with a session that has known token usage. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                               | Expect                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Inspect the token widget before clicking it.     | Only input and output counts show.                                                                           |
| Click the token widget.                          | Cache read and write totals, cache-hit percentage, cost, and subscription markers show where they apply.     |
| Click a copy placed elsewhere, then type.        | All token copies switch together, the context widget's mode doesn't change, and the text goes to the editor. |
| Switch to regular mode, then back to fullscreen. | Regular mode keeps the full display. Fullscreen restores the earlier choice.                                 |
