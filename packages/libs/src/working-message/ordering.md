# Working-message ordering and settings

[Working-message coordinator](README.md)

## Settings menu

`/working-message` takes no arguments and requires interactive TUI mode. It opens the project scope when project settings set an `order`, otherwise the global scope. Switch scopes inside the menu with **Tab**; project scope requires a trusted project.

Each scope keeps its own draft. An unset project draft inherits saved global ordering, never unsaved edits, and follows global saves until you edit it. Global drafts never inherit project ordering, and an unset global draft sorts IDs. Inheritance neither writes settings nor marks the project scope set. An explicit empty order is set and uses sorted ID order.

| Key                            | Action                                                 |
| ------------------------------ | ------------------------------------------------------ |
| **Up** or **Down**             | Select a component, stopping at boundaries             |
| **Shift+Up** or **Shift+Down** | Move the selected component                            |
| **Tab** or **Shift+Tab**       | Switch between global and project drafts               |
| **Ctrl+S**                     | Save the displayed scope and apply the effective order |
| **Escape** or **Ctrl+C**       | Close and discard all remaining unsaved drafts         |

Menu keys are fixed, independent of Pi's browser bindings, and Pi keeps transcript paging.

- Only saved drafts affect the message.
- An unset scope shows "(not set)" until it is saved, even when its draft is unchanged. **Ctrl+S** also saves an unchanged draft.
- Failed saves retain drafts for retry. Closing does not undo earlier saves.
- Global saves preserve project precedence.
- Components that register while the menu is open join each draft without losing edits. Unregistered IDs stay listed as unavailable.
- The menu never enables or disables components.

The menu uses the [shared settings frame](../tui/components/settings-menu/README.md); resize terminals smaller than 40×10 for the full view. Its [view](order-view.ts) holds the drafts and performs no I/O; lint applies the shared TUI component rules to it.

## Persistence

Global ordering lives in `getAgentDir()/settings.json` (honouring `PI_CODING_AGENT_DIR`); trusted project overrides live in `<cwd>/.pi/settings.json`, using Pi's configured directory name.

```json
{
  "workingMessage": {
    "order": ["pi-todo.activity", "another-extension.status"]
  }
}
```

A project `order` replaces the global array; removing it restores inheritance. Unknown IDs retain their positions through temporary contributor removal. See the [settings schema](settings.ts) for order limits.

Settings load at session start and when the menu opens. Invalid settings or read failures produce terminal-safe warnings and fall back to the other valid scope or sorted IDs. Opening the menu does not apply an order.

Saves use [locked settings section saves](../settings-file/README.md#sections), preserving unrelated fields and existing symlinks. An explicit save can replace an invalid `order` in an otherwise valid section, but never repairs a malformed file or section.
