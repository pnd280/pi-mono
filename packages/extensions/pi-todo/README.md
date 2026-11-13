# pi-todo

In multi-step work, the model's plan and progress scroll past in the transcript. pi-todo keeps them in a todo list that shows in a widget above the editor, which you can collapse in fullscreen mode, and `/todos` opens a read-only browser. You can also set where the active todo appears in the working message. Todos are saved in the session, so they follow branches and survive compaction.

During a four-step fix, the widget shows:

```text
• Todos (1/4 completed)
├─ ✓ Read the failing test
├─ • Fix the date parser (testing time zones)
├─ ◦ Add a regression test
└─ ◦ Update the changelog
```

## Controls

| Control                                             | Effect                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/todos`                                            | Open a read-only snapshot of the list in the [`/todos` browser](docs/controls.md#the-todos-browser).                                      |
| `/todos collapse`, `/todos expand`, `/todos toggle` | Collapse, expand, or toggle the widget for the current session, in fullscreen mode only. In regular mode, these commands report an error. |
| **Tab** after `/todos `                             | Complete the `/todos` arguments (`collapse`, `expand`, `toggle`) instead of file paths.                                                   |
| Click the widget                                    | Toggle the widget, in fullscreen mode.                                                                                                    |
| `/working-message`                                  | Change where the active todo appears among other working-message items, and save the order.                                               |
| `todo` model tool                                   | Create, update, list, get, delete, and clear todos. Only the model calls it; see [the todo tool](docs/todo-tool.md).                      |

## Usage

The extension is active only in interactive terminal sessions, in regular or fullscreen mode. It is never active in print, JSON, or RPC modes, or for informational CLI calls.

The model manages todos through the `todo` tool, and you follow along in the widget and the `/todos` browser. Todos can be nested and blocked by other todos, and a completed todo can't be reopened. Results save full snapshots in the session, except for [host errors](docs/todo-tool.md#replay). The extension draws no tool cards; [pi-tool-display](../pi-tool-display/docs/tools.md#todo) draws them.

In the `/todos` browser, move with **Up** and **Down**, press **Enter** for details, and press **Escape** to go back or close. Reopen the browser to see later changes. In fullscreen mode, the browser is part of the screen, not an overlay. For remapped keys and fullscreen key priority, read [browser controls](docs/controls.md#the-todos-browser).

In regular mode, the widget is always expanded. While the widget is collapsed, the working message shows the active todo instead.

## Configuration

Put the `ext.pi-todo` key in Pi's global `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json`), or in `.pi/settings.json` in the current directory of a [trusted](https://pi.dev/docs/latest/security#understand-project-trust) project. A trusted project's value overrides the global one. Settings load on session start, so run `/reload` after you edit them.

This example shows every field. Remove the comments before you copy it, because Pi reads `settings.json` as plain JSON:

```jsonc
{
  "ext.pi-todo": {
    // Optional. true or false. Whether the widget starts collapsed in fullscreen mode. Default: false. Regular mode ignores it.
    "collapseWidgetByDefault": false
  }
}
```

pi-todo ignores invalid settings. The working-message order is a separate setting, `workingMessage.order`, that `/working-message` saves.

## Side effects

- Todo state is stored only in the `todo` tool's result details, as full snapshots in Pi sessions. The `todo` tool and `/todos` write no other files, and make no network requests.
- Saving in `/working-message` writes the order to the global or trusted project `settings.json` shown in the menu, and keeps other settings.
- The extension removes terminal control characters from todo text shown in the widget, the browser, and the working message.

## Docs

| When you…                                                                | Read                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Want the exact actions, parameters, rules, and limits of the `todo` tool | [The todo tool](docs/todo-tool.md)                              |
| Use remapped browser keys or fullscreen key priority                     | [Browser controls](docs/controls.md#the-todos-browser)          |
| Need the settings file locations or the rules for invalid files          | [Settings](docs/controls.md#settings)                           |
| Want to reorder or save the working message                              | [Working-message order](docs/controls.md#working-message-order) |
| Change paging, the widget, or the working message                        | [Offline terminal checks](docs/validation.md) in both modes     |
| Decide where a test belongs                                              | [Testing](docs/testing.md)                                      |
| Upgrade Pi                                                               | [Pi compatibility](docs/pi-compatibility.md)                    |
