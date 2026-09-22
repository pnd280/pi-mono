# pi-todo

Session-backed todos for multi-step work, with an above-editor widget and read-only `/todos` browser. Active only in regular/fullscreen interactive TTY sessions, never print, JSON, RPC, or informational CLI calls.

## Usage

### Todos

The `todo` tool supports `create`, `update`, `list`, `get`, `delete`, and `clear`. Todos start `pending`. On update, `parentId: null` moves a subtree to the root. Parent status and dependencies do not control children. Dependency cycles are forbidden.

Deletion leaves tombstones, hidden by `list` unless `includeDeleted: true`. Todos with live descendants cannot be deleted but can be reparented. `clear` removes everything and resets IDs. Completed todos cannot return to `pending` or `in_progress`.

`list` limits output to 200 todo lines and 32,768 UTF-16 code units, but always includes the first todo line even if oversized. A truncation notice reports omitted todos; result details retain the full snapshot.

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

`/todos` opens the hierarchy. Use the configured selection keys to navigate, Enter to inspect details, and Escape to return or close. Page keys scroll details or move selection.

`/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session.

When collapsed, `pi-todo.activity` contributes the first in-progress todo's label or subject to the working message, with `(+N more)` for additional in-progress todos. Expanding the widget or leaving no todos in progress clears only that contribution.

`/working-message` opens the [shared ordering menu](../../libs/src/working-message/README.md#settings-menu) for contributions from participating extensions. Changes apply only when saved with Ctrl+S.

## Configuration

Set the literal `ext.pi-todo` key in Pi's global settings file or the current directory's [trusted](../../../node_modules/@earendil-works/pi-coding-agent/docs/settings.md#project-trust) `.pi/settings.json`. The global file is `~/.pi/agent/settings.json`, or `$PI_CODING_AGENT_DIR/settings.json` when that variable is set:

```json
{
  "ext.pi-todo": {
    "collapseWidgetByDefault": false
  }
}
```

`collapseWidgetByDefault` defaults to `false`. A trusted project field overrides the global field. An invalid section is ignored. Settings reload on session start. Widget commands do not write settings.

Working-message ordering uses the separate [`workingMessage.order` setting](../../libs/src/working-message/README.md#persistence).

## Side effects

Todo state is stored only in tool-result details as full snapshots in Pi sessions. Branch changes and compaction replay the latest valid result, skipping malformed snapshots and host errors. Version 2 retains hierarchy; version 1 and bounded unversioned snapshots replay flat.

Unversioned snapshots accept up to 10,000 todos and 8 MiB of state. Versioned and unversioned snapshots allow an additional 64 KiB for result parameters and errors, without increasing todo capacity. Oversized unversioned state remains readable but cannot be extended beyond current limits.

Todo text is stripped of terminal controls for the widget, browser, and working message. `/working-message` saves order to the displayed global/trusted project `settings.json`, preserving unrelated settings. The `todo` tool and `/todos` command write no separate files. No network requests.

## Validation

Run `vpr 'pi-todo#check'` and `vpr 'pi-todo#test'` from the workspace root. See the [workspace workflow](../../../docs/development.md#focused-validation).

For interactive changes, check `/todos` navigation and cancellation in regular and fullscreen modes. Include remapped selection and paging keys, narrow-terminal resizing, and widget restoration in a real Pi session.

### Working-message fixture

Launch the isolated, offline fixture from the workspace root in each mode:

```sh
vpr 'pi-todo#validate:terminal' regular
vpr 'pi-todo#validate:terminal' fullscreen
```

The launcher prints/retains its temporary directory and loads no user settings or credentials. Add `--reuse <directory>` after the mode to reuse settings; reseed todos after process restarts because sessions are not saved.

1. Submit `seed`, then `hold`: expect `Checking composition · Other status` for 30 seconds; Escape cancels.
2. During `hold`, open `/working-message`; check active entries, `fixture.inactive`, and `unavailable.activity`. Select with Up/Down and reorder with Shift+Up/Down. The working message must stay unchanged while editing. Resize narrow, Escape, and reopen; unsaved order must be discarded.
3. Tab between scopes; Ctrl+S different global/project orders. Saving global must preserve the active project override. Reopen and restart with `--reuse <directory>`; verify saved orders and unavailable IDs.
4. Make a draft change, then externally set `workingMessage.order` to `123` in the displayed fixture settings file. Ctrl+S must report an error, retain the draft, and leave the file unchanged. Restore the valid array and retry.
5. Use `hold` after `/todos expand` and `/todos collapse`; `Other status` must remain. `/fixture-status` clears it; `/fixture-status Other status` restores it. Expanded widget plus cleared status must show Pi's default message.
6. Collapse and restore `Other status`. Use `hold` after `/reload` to check restored activity without duplicates, and after `/new` to check old activity is cleared.
