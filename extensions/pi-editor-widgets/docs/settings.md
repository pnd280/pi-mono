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

| Entry                 | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `widget:<native-key>` | A widget registered with `setWidget()`.                             |
| `status:<native-key>` | A status registered with `setStatus()`.                             |
| `builtin:<name>`      | Built-in footer information; see [builtins.ts](../src/builtins.ts). |
| `separator`           | A divider.                                                          |
| `flex`                | Right-aligns the group that follows.                                |

- To hide something, list it in `hidden`. An empty region doesn't hide unlisted or future registrations.
- Unknown IDs keep their positions, so a widget reappears where you put it once its extension loads.
- In `aboveEditor`, shorter widgets in a multiline row align to the bottom, next to the editor. Other regions align them to the top.
- A row can contain each ID once and at most one `flex`. The same ID can appear in several rows, but an ID in `hidden` can't also be placed.
- The [layout schema](../src/layout.ts) defines the size limits and the default layout.

### Invalid layouts

Invalid layouts warn and fall back to the next scope, then defaults. Saves can replace an invalid layout inside a valid section, but do not overwrite malformed files or sections. See [settings persistence](../src/settings.ts) and the shared [settings section saves](../../../libs/src/settings-file/README.md#sections) for the implementation.
