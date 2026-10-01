# Widget settings and layouts

[pi-editor-widgets](../README.md)

For most layout changes, use `/widgets`. To edit layouts as JSON or set context colours, add an `ext.pi-editor-widgets` key to one of these files:

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
    },
    "contextThreshold": 150000
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
- Row constraints and defaults are defined in the [layout schema](../src/layout.ts).

### Invalid layouts

Invalid layouts warn and fall back to the next scope, then defaults. Saves can replace an invalid layout inside a valid section, but do not overwrite malformed files or sections. See [settings persistence](../src/settings.ts) and the shared [atomic settings updates](../../../libs/src/settings-file/README.md#behaviour) for the implementation.

## Context colours

`contextThreshold` is a token count, a positive integer, used only to colour the context widget. It does not change when Pi compacts automatically.

- Set it in JSON. Saving from `/widgets` keeps it.
- Opening the menu or running `/reload` applies edits made outside the menu, with no save needed.
- It resolves separately from the layout: a valid value in a trusted project overrides the global one.
- Invalid values show a warning and fall back to the next scope. With no valid threshold, colours follow the percentage of the context window used.

The exact colour bands and the token and context labels are defined by `contextColor` and the display functions in [builtins.ts](../src/builtins.ts).
