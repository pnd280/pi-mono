# pi-editor-widgets

Choose where Pi's widgets and statuses appear: above the editor, below it, or in the footer. For example, open `/widgets` to move a git-status widget into the footer beside the model name, or show the token count above the editor.

Other extensions keep using Pi's ordinary `setWidget()` and `setStatus()` APIs; this extension only arranges what they contribute. Built-in footer information can be arranged the same way. Works in the interactive TUI, in regular and fullscreen modes.

## Usage

1. Open `/widgets`, then choose a region, a row, and its contents.
2. Edit the layout with the keys shown in the menu:

   | Key                          | Action                                                                             |
   | ---------------------------- | ---------------------------------------------------------------------------------- |
   | **a**                        | Add a placement.                                                                   |
   | **Shift+Up**, **Shift+Down** | Move a placement.                                                                  |
   | **Delete**                   | Remove a placement. Removing the last copy hides that widget.                      |
   | **Tab**                      | Switch between global and project layouts. Project layouts need a trusted project. |

   Edits preview live but aren't saved yet.

3. Press **Ctrl+S** to save the layout you're viewing. If saving fails, your edits are kept so you can retry.
4. Press **Escape** to go back, or **Ctrl+C** to close and discard unsaved edits.

Widgets and statuses can share a row, or appear in several regions at once. A row too narrow for its contents wraps whole items onto the next line instead of shrinking them. An empty widget takes no space but keeps its position.

Widgets that contain Kitty or iTerm2 images use full-width rows and keep their native output intact. If the height limit falls inside one of these widgets, clipping stops before that widget.

### Token and context display

In fullscreen mode, click the token and context widget to switch between a compact and a detailed view. Regular mode always shows full token details and context percentages. The fullscreen choice resets on session start or `/reload`, and is never saved.

## Configuration

To edit layouts as JSON or set up inheritance between global and project layouts, read [settings and layouts](docs/settings.md). Preferences are reloaded on session start, `/reload`, and when you open `/widgets`.

## Side effects

- This extension takes over the whole footer. If another extension also replaces the footer, disable it and run `/reload`. Native widgets and statuses keep working.
- Moving, copying, or hiding a widget never creates or disposes it. Copies share one instance, including its side effects.
- Only **Ctrl+S** writes layout settings. Unrelated fields and settings symlinks are preserved. If a settings file or section is unreadable or malformed, repair it before saving.
- Mouse drag capture has [geometry limits](docs/pi-compatibility.md#limitations).

## Validation

Use the [focused checks](../../../docs/development.md#focused-validation) for `pi-editor-widgets`. For interaction changes, also run the maintainer [terminal checks](docs/testing.md#manual-checks). For Pi upgrades, follow the maintainer [compatibility checklist](docs/pi-compatibility.md).
