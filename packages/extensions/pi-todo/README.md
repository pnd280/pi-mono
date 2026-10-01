# pi-todo

Follow the model's plan and progress through a todo list for multi-step work. The list shows in a widget above the editor, and `/todos` opens a read-only browser. Todos are saved in the session, so they follow branches and survive compaction.

The extension is active only in interactive terminal sessions, in regular or fullscreen mode. It is never active in print, JSON, or RPC modes, or for informational CLI calls.

## Usage

The model manages todos through the `todo` tool; you follow along in the `/todos` browser and the widget.

### The `todo` tool

The model calls the `todo` tool with one of these actions: `create`, `update`, `list`, `get`, `delete`, and `clear`. The tool can only be called by the model directly, not through other tools, so every change leaves a snapshot that can be replayed.

- New todos start as `pending`. Completed todos can't go back to `pending` or `in_progress`.
- Todos can be nested. On `update`, `parentId: null` moves a todo and its children to the top level.
- A todo can be _blocked by_ others. Cycles of blocking todos aren't allowed.
- A parent's status and blockers don't affect its children.
- `delete` leaves a hidden marker (a _tombstone_). `list` hides deleted todos unless `includeDeleted: true`.
- A todo with children that are not deleted can be moved but not deleted.
- `clear` removes everything and resets IDs.
- `list` shortens its displayed output, but the result details keep the full snapshot.
- [Limits](src/constants.ts) on input and state also apply when results are replayed.

### The `/todos` browser

`/todos` opens a snapshot of the list; reopen it to see later changes.

| Key                            | Action                                 |
| ------------------------------ | -------------------------------------- |
| Up and down keys               | Move the selection.                    |
| Confirm (**Enter** by default) | Show details.                          |
| Cancel (**Escape** by default) | Go back, or close.                     |
| **PageUp**, **PageDown**       | Move the selection, or scroll details. |

**Ctrl+C** never closes the browser. The browser opens only if `tui.select.cancel` has a usable key other than **Ctrl+C**, as checked by [shared keybinding validation](../../libs/src/tui/keybindings/README.md#behaviour). If it is not, fix Pi's keybindings and run `/reload`.

In fullscreen mode, `/todos` is never shown as an overlay, and paging doesn't scroll the transcript. If [input routing](../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership) is unavailable, use the arrow keys.

### The widget

In fullscreen mode, `/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session, and clicking the widget also toggles it.

In regular mode the widget is always expanded, and these commands report an error. Your collapse preference applies again when you switch back to fullscreen.

While the widget is collapsed, the active todo is shown in the working message instead. Expanding the widget removes it. To change where it appears among other working-message items, use `/working-message`, which opens the [shared ordering menu](../../libs/src/working-message/README.md#settings-menu); changes apply only when you save with **Ctrl+S**.

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
- Invalid settings, and errors from the [settings-file reader](../../libs/src/settings-file/README.md#behaviour), are ignored.
- Settings load on session start. Widget commands never write settings.

Working-message order is a separate setting, [`workingMessage.order`](../../libs/src/working-message/README.md#persistence).

## Side effects

- Todo state is stored only in the `todo` tool's result details, as full snapshots in Pi sessions. The `todo` tool and `/todos` write no other files, and make no network requests.
- Saving in `/working-message` writes the order to the global or trusted project `settings.json` shown in the menu, keeping other settings.
- Terminal control characters are removed from todo text shown in the widget, the browser, and the working message.

### Replay

On branch changes and compaction, the latest valid result is replayed. Malformed snapshots and host errors are skipped.

| Snapshot format     | Replayed as                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Version 2           | A nested list.                                                                                          |
| Version 1           | A flat list.                                                                                            |
| Unversioned (older) | A flat list. Readable under larger replay limits, but an oversized list can't grow past current limits. |

## Validation

| When you ...                                      | Read                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Change paging, the widget, or the working message | [offline terminal checks](docs/validation.md) in regular and fullscreen modes |
| Decide where a test belongs                       | [testing](docs/testing.md) for what is tested here versus in shared libraries |
