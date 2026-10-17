# Editor-widget terminal validation for maintainers

[pi-editor-widgets](../README.md) · [Test coverage](testing.md)

For settings-write changes, also run `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'`.

Setup: use workspace Pi with this extension and a native widget contributor such as `pi-todo`. The menu needs no model call.

## Menu

| Do                                                                                           | Expect                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Open `/widgets` in regular mode, then in fullscreen mode.                                    | The menu is not an overlay.                                                                          |
| Resize the terminal while editing.                                                           | The selection stays on the intended item.                                                            |
| Inspect the draft after resizing.                                                            | The draft is kept.                                                                                   |
| Use the menu controls after resizing.                                                        | The controls work.                                                                                   |
| Close the menu.                                                                              | The editor has focus.                                                                                |
| Make edits.                                                                                  | They show in the real regions.                                                                       |
| Look for duplicates of an edited widget.                                                     | No extra live widget instance is created.                                                            |
| Make edits while the terminal has enough room.                                               | The regions stay visible.                                                                            |
| Close without saving.                                                                        | The saved layout is restored.                                                                        |
| Reorder, hide, re-add, and copy widgets with **a**; click each copy of a mouse-aware widget. | Every copy responds.                                                                                 |
| Leave rows and regions empty, and include unavailable saved IDs.                             | One blank line separates chat from the above-editor region, even when all its widgets are empty.     |
| Register widgets while editing.                                                              | New registrations don't change the selected widget.                                                  |
| Change a native placement while a nested row is open.                                        | The nested row keeps its identity, or the menu returns to the row list without applying stale input. |

## Layout and scopes

Setup: check at 80×24 and 40×10, in dark and light themes.

| Do                                                            | Expect                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Narrow the terminal.                                          | Footer rows wrap whole fields in order rather than squeezing them into columns. |
| Widen the terminal again.                                     | Shared rows are restored.                                                       |
| Find the active scope in the menu.                            | It is highlighted.                                                              |
| Find an unset scope and a changed scope.                      | Each has its marker.                                                            |
| Look at the menu at 80×24.                                    | The settings path is visible.                                                   |
| Look at the menu at 40×10.                                    | The settings path is hidden; it shows only at 60 columns and 18 rows or more.   |
| Open a list that is longer than the menu.                     | `(selected/total)` shows below the last visible item.                           |
| Navigate the menu.                                            | Navigation stays within the menu's bounds.                                      |
| Read the hint footer.                                         | It shows the save and exit keys.                                                |
| Save an unchanged scope that is unset.                        | The override is created.                                                        |
| Edit global and project drafts.                               | They stay independent.                                                          |
| Inspect inherited values in both scopes.                      | Inheritance runs one way, from global to project.                               |
| Save a global draft, then return to the inherited nested row. | The save doesn't move the inherited nested edits.                               |
| Choose "Reset to defaults".                                   | The default layout previews immediately.                                        |
| Inspect the settings file after the reset.                    | It is unchanged until **Ctrl+S**.                                               |

## Save failures

Setup: hold a settings lock, or make the settings file malformed JSON.

| Do                                                  | Expect                               |
| --------------------------------------------------- | ------------------------------------ |
| Save.                                               | Edits are kept.                      |
| Find the selected target after the failure.         | It stays visible.                    |
| Read the save feedback.                             | The recovery message stays visible.  |
| Press **Ctrl+S** again.                             | The save is retried.                 |
| Watch the notifications for a load or save failure. | No warning shows as success.         |
| Count the notifications for one failure.            | Each warning appears once.           |
| Wait three seconds after a success.                 | Success clears.                      |
| Edit after a success.                               | Success clears.                      |
| Switch scope after a success.                       | Success clears.                      |
| Wait after a warning or error.                      | The warning or error doesn't expire. |
| Fix the file and reopen.                            | Load warnings clear.                 |

## Images

Setup: use widgets with native `Image` output, in a Kitty terminal and an iTerm2 terminal. The expected results follow the [image placement policy](../README.md#usage).

| Do                                                                 | Expect                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Place image-only output and a captioned container in shared rows.  | Each image widget takes a full-width row.                                             |
| Look at the image widgets' neighbours.                             | They wrap to other lines.                                                             |
| Place one image widget in several regions.                         | Every copy preserves the complete image output, including its payload and blank rows. |
| Shrink the terminal until the height limit falls inside the image. | Clipping stops before the image widget.                                               |
| Click the visible widgets after shrinking.                         | Mouse cells match the visible output.                                                 |

## Lifecycle

Setup: run each of these, and do the first three checks after each one: `/reload`, a new session, a resumed session, and a renderer switch.

| Do                                                       | Expect                                     |
| -------------------------------------------------------- | ------------------------------------------ |
| Inspect the widget regions.                              | Only currently registered widgets show.    |
| Type in the editor.                                      | The editor is available.                   |
| Use native mouse interactions.                           | They work.                                 |
| Load a separate custom-footer extension, in both orders. | A conflict diagnostic appears.             |
| Disable the other footer extension and reload.           | This extension gets footer ownership back. |

## Context widget

Setup: start Pi in fullscreen with a session that has known context usage and automatic compaction enabled. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                                       | Expect                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Inspect the context widget before clicking it.           | The percentage is hidden.                                     |
| Click the context widget.                                | The percentage shows with the automatic compaction threshold. |
| Compare the threshold with Pi's effective model reserve. | The threshold matches.                                        |
| Switch to regular mode.                                  | The original percentage shows with `(auto)`.                  |
| Switch back to fullscreen.                               | The earlier choice is restored.                               |
| Click copies in every region and on wrapped rows.        | Every copy updates.                                           |
| Type after clicking a copy.                              | The text goes to the editor.                                  |
| Compact the session.                                     | Usage shows as unknown.                                       |

## Token widget

Setup: start Pi in fullscreen with a session that has known token usage. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                           | Expect                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Inspect the token widget before clicking it. | Only input and output counts show.                                                                       |
| Click the token widget.                      | Cache read and write totals, cache-hit percentage, cost, and subscription markers show where they apply. |
| Click a copy placed elsewhere.               | All copies switch together.                                                                              |
| Inspect the context widget after that click. | Its mode doesn't change.                                                                                 |
| Type after that click.                       | The text goes to the editor.                                                                             |
| Switch to regular mode.                      | The full display is kept.                                                                                |
| Switch back to fullscreen.                   | The earlier choice is restored.                                                                          |
