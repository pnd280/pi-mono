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

`/todos` opens a snapshot of the list. Reopen it to see later changes. The browser uses Pi's `tui.select.*` bindings. The keys below are defaults.

| Key                      | Action                                 |
| ------------------------ | -------------------------------------- |
| **Up**, **Down**         | Move the selection.                    |
| **Enter**                | Show details.                          |
| **Escape**               | Go back, or close.                     |
| **PageUp**, **PageDown** | Move the selection, or scroll details. |

**Ctrl+C** never closes the browser. The browser opens only if `tui.select.cancel` has a usable key other than **Ctrl+C**. Pi 1.4.0 can't use modified Escape or modified function-key bindings. If no usable key is bound, fix Pi's keybindings and run `/reload`.

In fullscreen mode, `/todos` is never shown as an overlay. While the view has focus, browser keys, including remapped ones, take priority over transcript controls. If Pi can't give the browser this priority, a warning appears each time you open `/todos`, and the browser stays open. If controls don't respond, use regular mode.

The footer keeps back or close first when space is limited. An empty list shows only the close hint.

### The widget

In fullscreen mode, `/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session, and clicking the widget also toggles it.

In regular mode the widget is always expanded, and these commands report an error. Your collapse preference applies again when you switch back to fullscreen.

While the widget is collapsed, the working message shows the active todo instead. Expanding the widget removes it. To change where it appears among other working-message items, run `/working-message`. Move the selected item with **Shift+Up** and **Shift+Down**, and save with **Ctrl+S**. Changes apply only when you save. **Escape** or **Ctrl+C** closes the menu and discards unsaved changes. For scopes and the other keys, see [working-message ordering](../../libs/src/working-message/ordering.md#settings-menu).

## Configuration

Add an `ext.pi-todo` key to Pi's global settings file, or to `.pi/settings.json` in the current directory of a [trusted](https://pi.dev/docs/latest/security#understand-project-trust) project. The global file is `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when that's set:

```json
{
  "ext.pi-todo": {
    "collapseWidgetByDefault": false
  }
}
```

- `collapseWidgetByDefault` defaults to `false` and affects fullscreen mode only.
- A trusted project's value overrides the global one.
- Invalid settings are ignored.
- A settings file is ignored if it can't be read, isn't a regular file, isn't valid UTF-8 JSON, is larger than 1 MiB, or changes size while Pi reads it.
- Settings load on session start. Widget commands never write settings.

Working-message order is a separate setting, `workingMessage.order`, which `/working-message` saves. A trusted project's `order` replaces the global one. For the file format and recovery from invalid settings, see [working-message persistence](../../libs/src/working-message/ordering.md#persistence).

## Side effects

- Todo state is stored only in the `todo` tool's result details, as full snapshots in Pi sessions. The `todo` tool and `/todos` write no other files, and make no network requests.
- Saving in `/working-message` writes the order to the global or trusted project `settings.json` shown in the menu, keeping other settings.
- The extension removes terminal control characters from todo text shown in the widget, the browser, and the working message.
- The extension rebuilds the list from the latest valid `todo` result on the current branch. [Replay](docs/todo-tool.md#replay) lists when this happens and which results it skips.

## Validation

| When you…                                         | Read                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Change paging, the widget, or the working message | [offline terminal checks](docs/validation.md) in regular and fullscreen modes |
| Decide where a test belongs                       | [testing](docs/testing.md) for what is tested here versus in shared libraries |
