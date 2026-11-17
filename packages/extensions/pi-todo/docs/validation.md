# Todo terminal validation for maintainers

[pi-todo](../README.md) · [Test coverage](testing.md)

## Terminal launcher

From the workspace root, launch the isolated, offline fixture in each mode:

```sh
vpr 'pi-todo#validate:terminal' regular
vpr 'pi-todo#validate:terminal' fullscreen
```

- The launcher prints its temporary directory and keeps it. It loads none of your settings or credentials.
- To reuse a fixture's settings, add `--reuse <directory>` after the mode. Sessions aren't saved, so seed todos again after restarting.

## Fullscreen paging checks

Setup: in the fullscreen fixture, submit `pages`. This clears the fixture's todos, creates 40 todos with long descriptions, and fills the transcript so it can scroll. A new fixture has no `agent/keybindings.json`, so Pi's defaults apply; delete the file and run `/reload` after each remapping check.

| Do                                                                                                                                                                                                                        | Expect                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Open `/todos`. In the list, press **PageUp** and **PageDown** at 80×24, narrow, and short sizes.                                                                                                                          | Only the list moves; the transcript stays still, even at the view's limits.                                  |
| Open `/todos`. In details, press **PageUp** and **PageDown** at 80×24, narrow, and short sizes.                                                                                                                           | Only the details move; the transcript stays still, even at the view's limits. `/todos` is never an overlay.  |
| In the fixture's `agent/keybindings.json`, bind `tui.select.pageUp` and `tui.altScreen.pageUp` to `ctrl+pageUp`, and both `pageDown` actions to `ctrl+pageDown`. Run `/reload` and repeat.                                | The same results with the new keys.                                                                          |
| Disable paging with `[]` and reload.                                                                                                                                                                                      | The list and details don't move, and the footer shows "page up unavailable" and "page down unavailable".     |
| Bind the paging keys to cancel or confirm, and reload.                                                                                                                                                                    | A key mapped to cancel or confirm performs that action without scrolling the transcript.                     |
| Open transcript search with `tui.altScreen.search` (**Ctrl+Shift+F** in this fixture, including on WSL; **Ctrl+F** on native Windows) and page.                                                                           | Paging doesn't reach todos until **Escape** closes the search.                                               |
| Open and close `/todos` several times. After the final close, press the transcript paging keys.                                                                                                                           | The transcript pages again.                                                                                  |
| Type a character in the editor.                                                                                                                                                                                           | The character appears in the editor.                                                                         |
| Remove that character and inspect the area above the editor.                                                                                                                                                              | The widget is visible again.                                                                                 |
| Run `/reload`, then repeat the three close-and-reopen checks above.                                                                                                                                                       | The same results.                                                                                            |
| Run `/new` and open `/todos`.                                                                                                                                                                                             | The old todos are cleared.                                                                                   |
| Close `/todos`, submit `pages` again, and repeat the three close-and-reopen checks above.                                                                                                                                 | The same results.                                                                                            |
| Open `/working-message` and press the arrow keys.                                                                                                                                                                         | The selection moves through the menu.                                                                        |
| In `/working-message`, press the page keys.                                                                                                                                                                               | The transcript scrolls; the menu selection doesn't move.                                                     |
| At 40×10, map cancel to **Ctrl+Shift+Left**, confirm to **Ctrl+Shift+Right**, and selection to **Ctrl+Shift+Up** and **Ctrl+Shift+Down**. Reload, then open `/todos`, press the new selection keys, and open the details. | The new selection keys move the list selection. The close or back hint stays visible before the other hints. |
| Run `/new`, resize to 30×10, and open `/todos`.                                                                                                                                                                           | The complete empty-list message and only the close hint are visible.                                         |
| In a regular-mode fixture, submit `pages` and repeat the navigation, cancelling, remapped-key, resizing, and widget checks above.                                                                                         | The same navigation and restoration behaviour holds without fullscreen transcript paging.                    |

## Working-message fixture

Setup: use the [offline launcher](#terminal-launcher), in both modes, and submit `seed`. In fullscreen mode, run `/todos collapse` before the first `hold`.

| Do                                                                                                                       | Expect                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| In fullscreen mode, submit `hold`.                                                                                       | "Checking composition · Other status" shows for 30 seconds.                                                                   |
| In regular mode, submit `hold`.                                                                                          | Only "Other status" shows for 30 seconds.                                                                                     |
| During `hold`, press **Escape**.                                                                                         | The hold cancels.                                                                                                             |
| Submit `hold` again and open `/working-message` while it is running.                                                     | Active entries, "Inactive component [fixture]" marked "inactive", and `unavailable.activity` marked "unavailable" are listed. |
| Select with **Up** and **Down**, and reorder with **Shift+Up** and **Shift+Down**.                                       | The working message doesn't change while you edit.                                                                            |
| Narrow the terminal, press **Escape**, and reopen.                                                                       | The unsaved order is discarded.                                                                                               |
| Press **Tab** to switch scopes, save different global and project orders with **Ctrl+S**, and reopen `/working-message`. | Saving the global order keeps the active project override. After reopening, both saved orders are unchanged.                  |
| Restart with `--reuse <directory>` and reopen `/working-message`.                                                        | The saved orders and the unavailable IDs are still there.                                                                     |
| Make a change, then outside Pi set `workingMessage` to `null` in the settings file the menu shows. Press **Ctrl+S**.     | An error is reported. The menu keeps your change and selection, and the settings file is unchanged.                           |
| Restore a valid object and retry.                                                                                        | The save succeeds.                                                                                                            |
| Try an invalid `order` inside an otherwise valid object and press **Ctrl+S**.                                            | The saved order replaces the invalid `order`, and the other fields in that object survive.                                    |
| In fullscreen mode, run `hold` after `/todos expand`, then after `/todos collapse`.                                      | "Other status" stays both times.                                                                                              |
| Run `/fixture-status`.                                                                                                   | The status clears.                                                                                                            |
| Run `/fixture-status Other status`.                                                                                      | The status comes back.                                                                                                        |
| Expand the widget, clear the status, and run `hold`.                                                                     | Pi's default message shows.                                                                                                   |
| In fullscreen mode, click the widget.                                                                                    | The widget toggles collapse, and the working-message activity toggles with it.                                                |
| In regular mode, run `/todos collapse`.                                                                                  | Regular mode reports an error, and the widget stays expanded.                                                                 |
| Switch modes.                                                                                                            | Fullscreen mode applies the collapse preference again; regular mode shows the widget expanded.                                |
| In fullscreen mode, collapse the widget, restore "Other status", and run `hold` after `/reload`.                         | The activity comes back without duplicates.                                                                                   |
| In fullscreen mode, collapse the widget, restore "Other status", and run `hold` after `/new`.                            | The old activity is gone.                                                                                                     |
| In fullscreen mode, collapse the widget, restore "Other status", submit `pages`, then `hold`.                            | Only "Other status" shows.                                                                                                    |
| Submit `seed`, open `/todos`, and close it.                                                                              | The todo widget and "Fixture widget" both show.                                                                               |
