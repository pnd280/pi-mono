# pi-editor-widgets

Pi puts each extension's widgets and statuses where that extension asks, so you can't choose what sits above the editor, below it, or in the footer. pi-editor-widgets lets you arrange them. For example, open `/widgets` to move a git-status widget into the footer beside the model name, or show the token count above the editor.

Other extensions keep using Pi's ordinary `setWidget()` and `setStatus()` APIs; this extension only arranges what they contribute. Built-in footer information can be arranged the same way. It works in the interactive TUI, in regular and fullscreen modes.

## Usage

1. Open `/widgets`, then choose a region, a row, and its contents. The menu uses Pi's `tui.select.up`, `tui.select.down`, `tui.select.confirm`, and `tui.select.cancel` keybindings. The default keys are **Up**, **Down**, **Enter**, and **Escape**.
2. Edit the layout with the keys shown in the menu:

   | Key                          | Action                                                                             |
   | ---------------------------- | ---------------------------------------------------------------------------------- |
   | **a**                        | Add a placement.                                                                   |
   | **Shift+Up**, **Shift+Down** | Move a placement.                                                                  |
   | **Delete**, **Backspace**    | Remove a placement. Removing the last copy hides that widget.                      |
   | **Tab**, **Shift+Tab**       | Switch between global and project layouts. Project layouts need a trusted project. |

   Edits preview live but aren't saved yet.

3. Press **Ctrl+S** to save the layout you're viewing. If saving fails, your edits are kept so you can retry.
4. Use the displayed back key to go back, or **Ctrl+C** to close and discard unsaved edits. The back key also closes the menu at the region list.

If you remap a Pi selection keybinding onto a menu key, such as **a** or **Tab**, the selection action takes that key. **Ctrl+S** and **Ctrl+C** always save and close. The menu hints show only the keys that work.

While the fullscreen menu has focus, its controls take priority over transcript controls. If input routing is unavailable, a warning appears once per opening. The menu stays open; use regular mode if controls do not respond. On a short terminal, tall regions can still be clipped while the menu is open.

Widgets and statuses can share a row, or appear in several regions at once. A row too narrow for its contents wraps whole items onto the next line instead of shrinking them. For empty widgets, image widgets, and alignment, read [how rows render](docs/settings.md#how-rows-render).

### Token and context display

In fullscreen mode, click the token and context widget to switch between a compact and a detailed view. Regular mode always shows full token details and context percentages. The fullscreen choice resets on session start or `/reload`, and is never saved.

## Configuration

To edit layouts as JSON or set up inheritance between global and project layouts, read [settings and layouts](docs/settings.md). Preferences are reloaded on session start, `/reload`, and when you open `/widgets`.

## Side effects

- This extension takes over the whole footer. If another extension also replaces the footer, a warning names the footer conflict, and this extension stops arranging widgets and statuses. Disable the other extension and run `/reload`. Native widgets and statuses keep working.
- Moving, copying, or hiding a widget never creates or disposes it. Copies share one instance, including its side effects.
- Only **Ctrl+S** writes layout settings. Unrelated fields and settings symlinks are preserved. If a settings file or section is unreadable or malformed, repair it before saving.
- Mouse input reaches widgets only in fullscreen mode. A drag that continues after the widget is redrawn follows the position where it was last drawn.

## Validation

| When you…                       | Read                                                |
| ------------------------------- | --------------------------------------------------- |
| Change menu or layout behaviour | [terminal checks](docs/validation.md)               |
| Decide where a test belongs     | [test coverage](docs/testing.md)                    |
| Upgrade Pi                      | [compatibility checklist](docs/pi-compatibility.md) |
