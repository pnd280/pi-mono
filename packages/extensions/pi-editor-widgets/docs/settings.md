# Widget settings and layouts

[pi-editor-widgets](../README.md)

Use `/widgets` for interactive layout editing. To edit JSON or set context colors, use the literal `ext.pi-editor-widgets` key in `~/.pi/agent/settings.json` (`$PI_CODING_AGENT_DIR/settings.json` when set) or the current directory's trusted `.pi/settings.json`. Ancestor settings are not searched.

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

A project layout replaces the **entire** global layout. Unset project drafts inherit the saved global layout, not unsaved global edits. A global draft previews even with a project override; the project layout applies again when the menu closes. Saving an unset scope creates an explicit layout; **Reset to defaults** also requires Ctrl+S.

Empty regions do not hide unlisted or future registrations; use `hidden` for suppression. Unknown IDs retain their positions. IDs use `widget:<native-key>`, `status:<native-key>`, or a [built-in ID](../src/builtins.ts). `separator` inserts a divider; `flex` right-aligns the following group. In `aboveEditor`, shorter widgets in a multiline row align to the row's bottom, next to the editor; other regions align them to the top. For row constraints and defaults, see the [layout schema](../src/layout.ts).

Invalid layouts warn and fall back to the next scope, then defaults. Saves can replace an invalid layout inside a valid section, but do not overwrite malformed files or sections. See [settings persistence](../src/settings.ts) and the shared [atomic settings updates](../../../libs/src/settings-file/README.md#behavior) for the implementation.

## Context colors

`contextThreshold` is a positive integer token budget for coloring context usage. It **does not change Pi's automatic compaction threshold**. Set it in JSON; `/widgets` saves preserve it. Opening the menu or running `/reload` applies external edits without a save.

The threshold resolves independently of the layout: a valid trusted-project value overrides global. Invalid values warn and fall back to the next scope; without a valid threshold, colors follow the percentage of the context window. For exact color bands and token/context labels, see `contextColor` and the display functions in [builtins.ts](../src/builtins.ts).
