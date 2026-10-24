# Widget settings and layouts

[pi-editor-widgets](../README.md)

For most layout changes, use `/widgets`. To edit layouts as JSON, add an `ext.pi-editor-widgets` key to one of these files:

| Scope   | File                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------- |
| Global  | `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when set.                           |
| Project | `.pi/settings.json` in the current directory, in a trusted project. Parent directories are not searched. |

```json
{
  "ext.pi-editor-widgets": {
    "layout": {
      "aboveEditor": [],
      "belowEditor": [],
      "footer": [
        ["builtin:cwd", "separator", "builtin:git-branch"],
        ["builtin:tokens", "separator", "builtin:context", "flex", "builtin:model"]
      ],
      "hidden": ["builtin:session-title"]
    }
  }
}
```

## Layouts and scope

A project layout replaces the entire global layout; the two are never merged.

- A project with no layout of its own inherits the saved global layout, not unsaved global edits.
- To restore inheritance, remove the project's `layout` field in JSON. The menu saves explicit layouts; resetting stages defaults rather than removing an override.
- A global draft previews even when a project layout exists. The project layout applies again when the menu closes.
- Saving a scope with no layout creates an explicit one.
- "Reset to defaults" previews the default layout immediately. Only **Ctrl+S** saves it.

### Row entries

| Entry                 | Meaning                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `widget:<native-key>` | A widget registered with `setWidget()`.                                                             |
| `status:<native-key>` | A status registered with `setStatus()`.                                                             |
| `builtin:<name>`      | Built-in footer information: `cwd`, `git-branch`, `session-title`, `tokens`, `context`, or `model`. |
| `separator`           | A divider.                                                                                          |
| `flex`                | Right-aligns the group that follows.                                                                |

- To hide something, list it in `hidden`. An empty region doesn't hide unlisted or future registrations.
- Unlisted widgets get their own rows at the end of the region that their extension requested, sorted by ID in code unit order, whatever the locale. Unlisted statuses share one footer row, also sorted by ID in code unit order.
- Unknown IDs keep their positions, so a widget reappears where you put it once its extension loads.
- A row can contain each ID once and at most one `flex`. The same ID can appear in several rows, but an ID in `hidden` can't also be placed.
- Each region holds at most 1,000 rows, and each row at most 1,000 entries. `hidden` holds at most 10,000 IDs, and each ID is at most 4,096 UTF-16 code units.
- The complete settings file, including unrelated settings, is limited to 1 MiB on read and after save formatting. An oversized file warns and falls back to the next scope. A save that exceeds the limit fails and keeps the draft.
- The default layout leaves the regions above and below the editor empty. Its first footer row shows `builtin:cwd`, `builtin:git-branch`, and `builtin:session-title`, with dividers between them. Its second footer row shows `builtin:tokens`, a divider, and `builtin:context`, then `builtin:model` right-aligned by `flex`.

### How rows render

- An empty widget takes no space but keeps its position.
- In `aboveEditor`, shorter widgets in a multiline row align to the bottom, next to the editor. Other regions align them to the top.
- Widgets that contain Kitty or iTerm2 images use full-width rows and keep their native output intact. If the height limit falls inside one of these widgets, clipping stops before that widget.

### Invalid layouts

Invalid layouts warn and fall back to the next scope, then defaults. Saves can replace an invalid layout inside a valid section, but do not overwrite malformed files or sections.
