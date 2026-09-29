# pi-todo

Session-backed todos for multi-step work, with an above-editor widget and read-only `/todos` browser. Active only in interactive TTY sessions in regular or fullscreen mode, never print, JSON, RPC, or informational CLI calls.

## Usage

### Todos

The `todo` tool supports `create`, `update`, `list`, `get`, `delete`, and `clear`. Todos start `pending`. On update, `parentId: null` moves a subtree to the root. Parent status and dependencies do not control children; dependency cycles are forbidden.

Deletion leaves tombstones, hidden by `list` unless `includeDeleted: true`. Todos with live descendants can be reparented but not deleted. `clear` removes everything and resets IDs. Completed todos cannot return to `pending` or `in_progress`.

`list` bounds displayed output to 200 todo lines and 32,768 UTF-16 code units (always showing the first line); result details retain the full snapshot.

| Item                              | Limit               |
| --------------------------------- | ------------------- |
| Todos, including tombstones       | 1,000               |
| Hierarchy depth                   | 8 levels            |
| Dependencies                      | 100 per todo        |
| Subject, in-progress label, owner | 200 characters each |
| Description                       | 4,000 characters    |
| Metadata                          | 16 KiB, 8 levels    |
| Stored todo state                 | 512 KiB             |

### Todo browser and widget

`/todos` opens a snapshot of the hierarchy; reopen to see later changes. Use the configured up/down keys to navigate, confirm (Enter by default) to inspect details, and cancel (Escape by default) to return or close. Paging moves the list selection or scrolls details.

Ctrl+C never cancels the browser. Opening requires a `tui.select.cancel` binding other than Ctrl+C; if none exists, fix Pi's keybindings and `/reload`.

In fullscreen mode `/todos` is non-overlay and paging does not scroll the transcript. If [input routing](../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership) is unavailable, use arrow navigation.

`/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session.

When collapsed, the widget contributes in-progress todo activity to the working message. Expanding it clears that contribution.

`/working-message` opens the [shared ordering menu](../../libs/src/working-message/README.md#settings-menu) for contributions from participating extensions. Changes apply only when saved with Ctrl+S.

## Configuration

Set the literal `ext.pi-todo` key in Pi's global settings file or the current directory's [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/security.md#project-trust) `.pi/settings.json`. The global file is `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when that variable is set:

```json
{
  "ext.pi-todo": {
    "collapseWidgetByDefault": false
  }
}
```

`collapseWidgetByDefault` defaults to `false`. A trusted project field overrides the global field. Invalid settings or failures from the [settings-file reader](../../libs/src/settings-file/README.md#behavior) are ignored. Settings reload on session start. Widget commands do not write settings.

Working-message ordering uses the separate [`workingMessage.order` setting](../../libs/src/working-message/README.md#persistence).

## Side effects

Todo state is stored only in tool-result details as full snapshots in Pi sessions. Branch changes and compaction replay the latest valid result, skipping malformed snapshots and host errors. Version 2 retains hierarchy; version 1 and bounded unversioned snapshots replay flat.

Legacy unversioned snapshots remain readable under their larger replay limits, but oversized ones cannot be extended beyond current limits.

Todo text is stripped of terminal controls for the widget, browser, and working message. `/working-message` saves order to the displayed global/trusted project `settings.json`, preserving unrelated settings. The `todo` tool and `/todos` command write no separate files. No network requests.

## Validation

[Coverage specification](docs/testing.md).

Run `vpr 'pi-todo#check'` and `vpr 'pi-todo#test'` from the workspace root. See the [workspace workflow](../../../docs/development.md#focused-validation).

For paging, widget, or working-message changes, use the [offline terminal checks](docs/validation.md) in regular and fullscreen modes.
