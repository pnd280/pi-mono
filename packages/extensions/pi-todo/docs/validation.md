# Todo terminal validation for maintainers

[pi-todo](../README.md)

When changing paging, widgets, or working messages, run the offline terminal fixture below. See [testing](testing.md) for automated coverage.

## Terminal launcher

From the workspace root, launch the isolated, offline fixture in each mode:

```sh
vpr 'pi-todo#validate:terminal' regular
vpr 'pi-todo#validate:terminal' fullscreen
```

- The launcher prints its temporary directory and keeps it. It loads none of your settings or credentials.
- To reuse a fixture's settings, add `--reuse <directory>` after the mode. Sessions aren't saved, so seed todos again after restarting.
- Edit only fixture settings, never your real agent settings.

## Fullscreen paging checks

Setup: in the fullscreen fixture, submit `pages`. This clears the fixture's todos, creates 40 todos with long descriptions, and fills the transcript so it can scroll.

| Do                                                                                                                                                                                         | Expect                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Open `/todos`. In the list, press **PageUp** and **PageDown** at 80×24, narrow, and short sizes.                                                                                           | Only the list moves; the transcript stays still, even at the view's limits.                                 |
| Open `/todos`. In details, press **PageUp** and **PageDown** at 80×24, narrow, and short sizes.                                                                                            | Only the details move; the transcript stays still, even at the view's limits. `/todos` is never an overlay. |
| In the fixture's `agent/keybindings.json`, bind `tui.select.pageUp` and `tui.altScreen.pageUp` to `ctrl+pageUp`, and both `pageDown` actions to `ctrl+pageDown`. Run `/reload` and repeat. | The same results with the new keys.                                                                         |
| Disable paging with `[]`; separately, bind the paging keys to cancel or confirm. Reload after each change.                                                                                 | Those bindings aren't reserved for paging.                                                                  |
| Open transcript search with `tui.altScreen.search` (**Ctrl+Shift+F**; **Ctrl+F** on Windows and WSL) and page.                                                                             | Paging doesn't reach todos until **Escape** closes the search.                                              |
| Open and close `/todos` several times. After the final close, press the transcript paging keys.                                                                                            | The transcript pages again.                                                                                 |
| Type a character in the editor.                                                                                                                                                            | The character appears in the editor.                                                                        |
| Remove that character and inspect the area above the editor.                                                                                                                               | The widget is visible again.                                                                                |
| Run `/reload`, then repeat the three close-and-reopen checks above.                                                                                                                        | The same results.                                                                                           |
| Run `/new` and open `/todos`.                                                                                                                                                              | The old todos are cleared.                                                                                  |
| Close `/todos`, submit `pages` again, and repeat the three close-and-reopen checks above.                                                                                                  | The same results.                                                                                           |
| Open `/working-message` and press the arrow keys.                                                                                                                                          | The selection moves through the menu.                                                                       |
| In `/working-message`, press the page keys.                                                                                                                                                | They keep their usual routing.                                                                              |
| In regular mode, repeat the navigation, cancelling, remapped-key, resizing, and widget checks above.                                                                                       | The same navigation and restoration behaviour holds without fullscreen transcript paging.                   |

## Working-message fixture

Setup: use the [offline launcher](#terminal-launcher), in both modes, and submit `seed`. In fullscreen mode, run `/todos collapse` before the first `hold`.

| Do                                                                                                                   | Expect                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| In fullscreen mode, submit `hold`.                                                                                   | "Checking composition · Other status" shows for 30 seconds.                |
| In regular mode, submit `hold`.                                                                                      | Only "Other status" shows for 30 seconds.                                  |
| During `hold`, press **Escape**.                                                                                     | The hold cancels.                                                          |
| Submit `hold` again and open `/working-message` while it is running.                                                 | Active entries, `fixture.inactive`, and `unavailable.activity` are listed. |
| Select with **Up** and **Down**, and reorder with **Shift+Up** and **Shift+Down**.                                   | The working message doesn't change while you edit.                         |
| Narrow the terminal, press **Escape**, and reopen.                                                                   | The unsaved order is discarded.                                            |
| Press **Tab** to switch scopes, and save different global and project orders with **Ctrl+S**.                        | Saving the global order keeps the active project override.                 |
| Reopen `/working-message`.                                                                                           | The saved global and project orders are unchanged.                         |
| Restart with `--reuse <directory>` and reopen `/working-message`.                                                    | The saved orders are still there.                                          |
| Find the unavailable IDs in the reopened menu.                                                                       | They are still there.                                                      |
| Make a change, then outside Pi set `workingMessage` to `null` in the settings file the menu shows. Press **Ctrl+S**. | An error is reported.                                                      |
| Inspect the menu after the error.                                                                                    | Your change and selection are kept.                                        |
| Inspect the settings file after the error.                                                                           | The file is unchanged.                                                     |
| Restore a valid object and retry.                                                                                    | The save succeeds.                                                         |
| Try an invalid `order` inside an otherwise valid object and press **Ctrl+S**.                                        | The invalid `order` may be replaced by the explicit save.                  |
| Inspect the other fields in that object.                                                                             | They survive.                                                              |
| In fullscreen mode, run `hold` after `/todos expand`.                                                                | "Other status" stays.                                                      |
| In fullscreen mode, run `hold` after `/todos collapse`.                                                              | "Other status" stays.                                                      |
| Run `/fixture-status`.                                                                                               | The status clears.                                                         |
| Run `/fixture-status Other status`.                                                                                  | The status comes back.                                                     |
| Expand the widget, clear the status, and run `hold`.                                                                 | Pi's default message shows.                                                |
| In fullscreen mode, click the widget.                                                                                | The widget toggles collapse.                                               |
| After that click, inspect the working message.                                                                       | Its activity has toggled with the widget.                                  |
| In regular mode, run `/todos collapse`.                                                                              | Regular mode reports an error.                                             |
| Inspect the widget after the error.                                                                                  | It stays expanded.                                                         |
| Switch modes.                                                                                                        | Switching modes applies or suspends the collapse preference.               |
| In fullscreen mode, collapse the widget, restore "Other status", and run `hold` after `/reload`.                     | The activity comes back without duplicates.                                |
| In fullscreen mode, collapse the widget, restore "Other status", and run `hold` after `/new`.                        | The old activity is gone.                                                  |
