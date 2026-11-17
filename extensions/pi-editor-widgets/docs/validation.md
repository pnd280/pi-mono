# Editor-widget terminal validation for maintainers

[pi-editor-widgets](../README.md) · [Test coverage](testing.md)

Setup: use workspace Pi in a trusted project with this extension and a native widget contributor, such as `pi-todo` with at least one unfinished task. The menu needs no model call. For the fullscreen paging checks, use a transcript longer than one screen and scroll up first, so that a wrongly routed paging key would move it. For remapping and save-failure checks, use the [isolated todo launcher](../../pi-todo/docs/validation.md#terminal-launcher), append `-e "$PWD/packages/extensions/pi-editor-widgets"` to its launch command, and submit `seed`. Remap keys in the fixture's `agent/keybindings.json`, and run `/reload` after each change.

## Menu

| Do                                                                                                                                                                | Expect                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Resize the terminal while editing.                                                                                                                                | The selection stays on the intended item, and the draft is kept.                                              |
| After each resize, from a row's contents, press one of **a**, **Tab**, and **Shift+Up**, and go back before the next.                                             | **a** and **Shift+Up** act on the selected item, and **Tab** switches the layout scope, as before the resize. |
| Close the menu.                                                                                                                                                   | The editor has focus.                                                                                         |
| Reorder, hide, re-add, and copy widgets with **a**; click each copy of a mouse-aware widget.                                                                      | Every copy responds to its click.                                                                             |
| Leave rows and regions empty, and include unavailable saved IDs.                                                                                                  | One blank line separates chat from the above-editor region, even when all its widgets are empty.              |
| In fullscreen mode, map `tui.altScreen.pageDown` to **Down**, open `/widgets`, and press **Down**.                                                                | The menu selects the next item without scrolling the transcript.                                              |
| Map `tui.altScreen.pageDown` to **Ctrl+S**, open `/widgets`, and press **Ctrl+S**.                                                                                | The displayed scope is saved without scrolling the transcript.                                                |
| Map `tui.altScreen.pageDown` to **Ctrl+C**, open `/widgets`, and press **Ctrl+C**.                                                                                | The menu closes without scrolling the transcript, and the editor regains focus.                               |
| After closing the menu, press the remapped transcript paging key.                                                                                                 | The transcript pages again.                                                                                   |
| In fullscreen mode, map `tui.select.up` to **k**, `tui.select.down` to **j**, and `tui.altScreen.pageDown` to **j**. Open `/widgets` and press **j**, then **k**. | The selection moves down, then up without scrolling the transcript, and the hints show `k/j select`.          |
| Map `tui.select.cancel` to **q**, open a region, and press **Escape**, then **q**.                                                                                | **Escape** does nothing. **q** goes back, and the hint shows `q close` at the root.                           |
| Map `tui.select.confirm` to **a**, open a region that has a row, and press **a**.                                                                                 | **a** opens the selected row, and the hints show "add unavailable".                                           |
| With that remap, return to the region list and open an empty region.                                                                                              | The empty-list message says "Add unavailable" and does not tell you to press **a**.                           |
| Map `tui.select.up` to **Tab**, open `/widgets`, and press **Shift+Tab**.                                                                                         | The layout scope changes, and the scope hint shows `Shift+Tab scope`.                                         |
| Set `tui.select.cancel` to `[]` and open a region.                                                                                                                | The exit hint shows `Ctrl+C close` instead of an unavailable back key.                                        |
| Map `tui.select.confirm` to **Ctrl+S** and `tui.select.cancel` to **Ctrl+C**. Open `/widgets` and press **Ctrl+S**, then **Ctrl+C**.                              | The displayed scope is saved, then the menu closes and the editor regains focus.                              |
| Remove one copy of a widget that has another placement.                                                                                                           | The other placement still shows the widget.                                                                   |

## Layout and scopes

Setup: check at 80×24 and 40×10, in dark and light themes.

| Do                                                                            | Expect                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Narrow the terminal, then widen it again.                                     | Footer rows wrap whole fields in order rather than squeezing them into columns. Shared rows return when the terminal is wide again.                                            |
| Find the active scope, an unset scope, and a changed scope in the menu.       | The active scope is highlighted. The unset and changed scopes each show their marker.                                                                                          |
| Look at the menu at 80×24, then at 40×10.                                     | At 80×24, with at most four rows in the live regions, the settings path is visible. At 40×10 it is hidden; it shows only when the menu area is at least 60 columns by 18 rows. |
| Open a list that is longer than the menu, and navigate to its end.            | `(selected/total)` shows below the last visible item, and the selection stays within the menu.                                                                                 |
| Read the hint footer.                                                         | It shows the save and exit keys.                                                                                                                                               |
| Save an unchanged scope that is unset.                                        | The settings file gets an explicit layout for that scope.                                                                                                                      |
| Edit global and project drafts, then inspect inherited values in both scopes. | The drafts stay independent. Inheritance runs one way, from global to project.                                                                                                 |
| Choose "Reset to defaults", then inspect the settings file.                   | The default layout previews immediately. The settings file is unchanged until **Ctrl+S**.                                                                                      |

## Save failures

Setup: in the isolated fixture above, hold a settings lock, or make its settings file malformed JSON.

| Do                                                          | Expect                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Save.                                                       | Edits are kept, the selected target stays visible, and the recovery message stays visible. |
| Release the lock or fix the file, then press **Ctrl+S**.    | The kept draft is saved, and a success message shows.                                      |
| Read the menu feedback for one load or save failure.        | The failure appears as a warning or error, never as success.                               |
| After a success, wait three seconds, edit, or switch scope. | Each one clears the success message.                                                       |
| Wait after a warning or error.                              | The warning or error doesn't expire.                                                       |
| Fix the file and reopen.                                    | Load warnings clear.                                                                       |

## Images

Setup: load a test extension whose widgets render a pi-tui `Image` at least three rows high, alone and with a caption in a `Container`, and a mouse-aware widget. Check in a Kitty terminal, and in an iTerm2 terminal in regular mode, because Pi's fullscreen mode turns off iTerm2 images. The expected results follow the [image placement policy](settings.md#how-rows-render).

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
| Load a separate custom-footer extension, then disable it and reload. | This extension's footer layout shows again.                                                 |

## Git changes

Setup: use a disposable Git repository with an unstaged edit to one tracked file, a staged edit to another tracked file, and an untracked file. Start Pi with the default layout. Trace the processes that Pi starts, for example with `strace -f -e trace=execve`, to see the `git` commands of the item.

| Do                                                                                                                                                          | Expect                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Inspect the footer and the trace before changing the layout.                                                                                                | The footer has no git changes item, and the trace has no `git rev-parse`, `git diff`, or `git ls-files` command.    |
| Open `/widgets`, add "Git changes" to a footer row, save, and close the menu.                                                                               | It shows the unstaged lines, the staged lines in brackets, and the untracked count after `U`.                       |
| Run `git add` on the unstaged file in another terminal.                                                                                                     | After a moment and without input in Pi, the unstaged counts go, and the staged counts rise and lose their brackets. |
| Run `!git reset -q` in Pi.                                                                                                                                  | The item updates when the command finishes.                                                                         |
| Let the agent edit a file.                                                                                                                                  | The item updates when the tool call finishes.                                                                       |
| During an agent response, run `!git add` on an edited file.                                                                                                 | The item updates by the time the agent finishes.                                                                    |
| Edit a file in another editor, then run `!true` in Pi.                                                                                                      | The item updates after the `!` command, not before it.                                                              |
| Start Pi in a subdirectory of the repository.                                                                                                               | The counts are the same as at the repository root.                                                                  |
| Commit or discard every change.                                                                                                                             | The item takes no space in the footer.                                                                              |
| Make a new unstaged edit, then run `/reload` and start a new session with the item placed.                                                                  | After each action, the item shows the new edit's line counts.                                                       |
| Start Pi outside a repository with the item placed.                                                                                                         | The item shows nothing, and no warning appears.                                                                     |
| Return to the repository with the item placed. Remove every copy in `/widgets`, save, and close the menu. Then edit and stage a file from another terminal. | The trace shows no new `git rev-parse`, `git diff`, or `git ls-files` command.                                      |

## Context widget

Setup: start Pi in fullscreen with a session that has known context usage and automatic compaction enabled. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                                                | Expect                                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect the context widget before clicking it.                    | The percentage is hidden.                                                                                                                                               |
| Click the context widget.                                         | The percentage shows with the automatic compaction threshold, which uses the selected model's compaction reserve, also when a routed model supplies the context window. |
| Switch to regular mode, then back to fullscreen.                  | Regular mode shows the original percentage with `(auto)`. Fullscreen restores the earlier choice.                                                                       |
| Click copies in every region and on wrapped rows, then type.      | Every copy updates, and the text goes to the editor.                                                                                                                    |
| With usage above 70%, then above 90%, inspect the context widget. | It shows in the warning colour, then in the error colour, as in Pi's native footer.                                                                                     |
| Compact the session.                                              | Usage shows as unknown.                                                                                                                                                 |

## Token widget

Setup: start Pi in fullscreen with a session that has known token usage. Each click toggles between compact and verbose display; fullscreen starts compact.

| Do                                               | Expect                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Inspect the token widget before clicking it.     | Only input and output counts show.                                                                           |
| Click the token widget.                          | Cache read and write totals, cache-hit percentage, cost, and subscription markers show where they apply.     |
| Click a copy placed elsewhere, then type.        | All token copies switch together, the context widget's mode doesn't change, and the text goes to the editor. |
| Switch to regular mode, then back to fullscreen. | Regular mode keeps the full display. Fullscreen restores the earlier choice.                                 |
