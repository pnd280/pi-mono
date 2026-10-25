# pi-todo

Follow the model's plan and progress through a todo list for multi-step work. The list shows in a widget above the editor, and `/todos` opens a read-only browser. Todos are saved in the session, so they follow branches and survive compaction.

During a four-step fix, the widget shows:

```text
• Todos (1/4 completed)
├─ ✓ Read the failing test
├─ • Fix the date parser (testing time zones)
├─ ◦ Add a regression test
└─ ◦ Update the changelog
```

The extension is active only in interactive terminal sessions, in regular or fullscreen mode. It is never active in print, JSON, or RPC modes, or for informational CLI calls.

## Usage

The model manages todos through the `todo` tool. You follow along in the `/todos` browser and the widget.

### The `todo` tool

The model calls the `todo` tool to create, update, list, get, delete, and clear todos. Todos can be nested and blocked by other todos, and a completed todo can't be reopened. Results save full snapshots in the session, except for [host errors](docs/todo-tool.md#replay).

The extension draws no tool cards. [pi-tool-display](../pi-tool-display/docs/tools.md#todo) draws them. To see the exact rules, limits, and card text that the tool uses, read [the todo tool](docs/todo-tool.md).

### The `/todos` browser

`/todos` opens a read-only snapshot of the list. Move with **Up** and **Down**, press **Enter** for details, and press **Escape** to go back or close. Reopen it to see later changes. In fullscreen mode, the browser is part of the screen, not an overlay. For remapped keys and fullscreen key priority, read [browser controls](docs/controls.md#the-todos-browser).

### The widget

In fullscreen mode, `/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session, and clicking the widget also toggles it. In regular mode, the widget is always expanded. While the widget is collapsed, the working message shows the active todo instead, and `/working-message` changes where it appears.

## Configuration

Add an `ext.pi-todo` key to Pi's global settings file, or to `.pi/settings.json` in the current directory of a [trusted](https://pi.dev/docs/latest/security#understand-project-trust) project:

```json
{
  "ext.pi-todo": {
    "collapseWidgetByDefault": false
  }
}
```

`collapseWidgetByDefault` sets whether the widget starts collapsed in fullscreen mode.

| When you…                                                       | Read                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| Need the settings file locations or the rules for invalid files | [settings](docs/controls.md#settings)                           |
| Want to reorder or save the working message                     | [working-message order](docs/controls.md#working-message-order) |

## Side effects

- Todo state is stored only in the `todo` tool's result details, as full snapshots in Pi sessions. The `todo` tool and `/todos` write no other files, and make no network requests.
- Saving in `/working-message` writes the order to the global or trusted project `settings.json` shown in the menu, and keeps other settings.
- The extension removes terminal control characters from todo text shown in the widget, the browser, and the working message.
- The extension rebuilds the list from the latest valid `todo` result on the current branch. [Replay](docs/todo-tool.md#replay) lists when this happens and which results it skips.

## Validation

| When you…                                         | Read                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Change paging, the widget, or the working message | [offline terminal checks](docs/validation.md) in regular and fullscreen modes |
| Decide where a test belongs                       | [testing](docs/testing.md) for what is tested here versus in shared libraries |
