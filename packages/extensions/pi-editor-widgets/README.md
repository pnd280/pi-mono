# pi-editor-widgets

Pi puts each extension's widgets and statuses where that extension asks, so you can't choose what sits above the editor, below it, or in the footer. pi-editor-widgets lets you arrange, copy, and hide widgets, statuses, and Pi's built-in footer information in global and project layouts, and lets you switch the token display and the context display separately between a compact and a detailed view.

For example, open `/widgets` to move a git-status widget into the footer beside the model name, or show the token count above the editor.

Other extensions keep using Pi's ordinary `setWidget()` and `setStatus()` APIs; this extension only arranges what they contribute. It works in the interactive TUI, in regular and fullscreen modes.

## Controls

| Control                   | Effect                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `/widgets`                | Open the layout menu in the interactive TUI. The command takes no arguments.               |
| Click the token display   | In fullscreen mode, switch only the token display between a compact and a detailed view.   |
| Click the context display | In fullscreen mode, switch only the context display between a compact and a detailed view. |

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

Regular mode always shows full token details and context percentages. In fullscreen mode, the token display and the context display each keep their own compact or detailed choice, and all copies of one display switch together. Each choice resets on session start or `/reload`, and is never saved.

### Git changes

The optional "Git changes" item shows the lines added and removed by unstaged and by staged changes, and the number of untracked files. To show it, and for what it counts and when it updates, read [git changes](docs/settings.md#git-changes).

## Configuration

Most users edit layouts with `/widgets`. To edit a layout as JSON, put the `ext.pi-editor-widgets` section in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), in `.pi/settings.json` in the current directory of a [trusted project](https://pi.dev/docs/latest/security#understand-project-trust), or in both. A project layout replaces the whole global layout; the two are never merged. A project without a layout inherits the saved global layout. The extension reads layouts again on session start, on `/reload`, and when you open `/widgets`.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-editor-widgets": {
    // Optional. Omit it to inherit the global layout, or in global settings to use the default layout.
    // When present, all four regions are required and no other fields are allowed.
    "layout": {
      // Rows above the editor. Each row lists widget:<key>, status:<key>, builtin:<name>, "separator", or "flex".
      // Up to 1,000 rows, each with up to 1,000 entries. Default: no rows.
      "aboveEditor": [],
      // Rows below the editor, with the same entries and limits. Default: no rows.
      "belowEditor": [["widget:git-status"]],
      // Footer rows, with the same entries and limits. A row has each ID once and at most one "flex".
      // Built-in names: cwd, git-branch, git-changes, session-title, tokens, context, and model.
      // Default: cwd, git-branch, and session-title, then tokens and context with model right-aligned.
      "footer": [
        ["builtin:cwd", "separator", "builtin:git-branch"],
        ["builtin:tokens", "separator", "builtin:context", "flex", "builtin:model"]
      ],
      // IDs to show nowhere. Up to 10,000 unique IDs that are not placed in a row. Default: builtin:git-changes.
      "hidden": ["builtin:session-title", "builtin:git-changes"]
    }
  }
}
```

Each ID is at most 4,096 Unicode code points, and the whole settings file is limited to 1 MiB. An invalid layout shows a warning and falls back to the next scope, then to the defaults. For unlisted widgets and statuses, unknown IDs, and every limit, read [widget settings and layouts](docs/settings.md).

## Side effects

- This extension takes over the whole footer. If another extension also replaces the footer, a warning names the footer conflict, and this extension stops arranging widgets and statuses. Disable the other extension and run `/reload`. Native widgets and statuses keep working.
- Moving, copying, or hiding a widget never creates or disposes it. Copies share one instance, including its side effects.
- Only **Ctrl+S** writes layout settings. Unrelated fields and settings symlinks are preserved. If a settings file or section is unreadable or malformed, repair it before saving.
- The optional [git changes item](docs/settings.md#git-changes) runs read-only `git` commands and watches the repository's Git directory. The guide states when this starts and stops.
- Mouse input reaches widgets only in fullscreen mode. A drag that continues after the widget is redrawn follows the position where it was last drawn.

## Docs

| When you…                                                               | Read                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| Edit layouts as JSON, or need scope rules, row entries, and every limit | [Widget settings and layouts](docs/settings.md)     |
| Want to know how empty widgets, image widgets, and alignment render     | [How rows render](docs/settings.md#how-rows-render) |
| Want to know what the git changes item counts and when it updates       | [Git changes](docs/settings.md#git-changes)         |
| Change menu or layout behaviour                                         | [Terminal validation](docs/validation.md)           |
| Decide where a test belongs                                             | [Test coverage](docs/testing.md)                    |
| Upgrade Pi                                                              | [Compatibility checklist](docs/pi-compatibility.md) |
