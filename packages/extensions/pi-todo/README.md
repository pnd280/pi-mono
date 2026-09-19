# pi-todo

Track multi-step work with session-backed tasks, an above-editor progress widget, and a read-only `/todos` browser. The extension activates only for interactive TTY sessions, including regular and fullscreen modes. It stays inactive for print, JSON, RPC, and informational CLI invocations.

## Usage

### Tasks

The `todo` tool supports `create`, `update`, `list`, `get`, `delete`, and `clear`. New tasks are pending. Updates can change fields, status, dependencies, or `parentId`. Setting `parentId: null` moves a subtree to the root. Parent status and dependencies do not control children. Dependencies cannot form cycles.

Deletion leaves a tombstone. A task with non-deleted descendants cannot transition to `deleted`, but it can be reparented. `list` hides tombstones unless `includeDeleted: true`. `clear` removes all tasks and resets IDs. Completed tasks cannot return to pending or in progress.

`list` uses a 200-task-line limit and a 32,768-character budget, measured in UTF-16 code units. The first task line is always included, even if oversized. Truncation adds an omitted-task count. Result details retain the complete snapshot.

Current task limits are:

| Item                              | Limit               |
| --------------------------------- | ------------------- |
| Tasks, including tombstones       | 1,000               |
| Hierarchy depth                   | 8 levels            |
| Dependencies                      | 100 per task        |
| Subject, in-progress label, owner | 200 characters each |
| Description                       | 4,000 characters    |
| Metadata                          | 16 KiB, 8 levels    |
| Stored task state                 | 512 KiB             |

### Task browser and widget

`/todos` opens the hierarchy. Use the configured selection keys to navigate, Enter to inspect details, and Escape to return or close. Page keys scroll details or move selection.

`/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session. When collapsed, `pi-todo.activity` contributes the first in-progress task's label or subject to the working message, with `(+N more)` for additional in-progress tasks. Expanding the widget or leaving no tasks in progress clears only that contribution.

`/working-message` opens the [shared ordering menu](../../libs/src/working-message/README.md#settings-menu) for contributions from participating extensions. Changes apply only when saved with Ctrl+S.

## Configuration

Set the literal `ext.pi-todo` key in Pi's global `settings.json` or the current directory's trusted `.pi/settings.json`:

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

Tool-result details persist complete task snapshots in Pi's session and are the only durable task storage. Branch changes and compaction reconstruct state from the latest valid result, skipping malformed snapshots and host errors. Version 2 retains hierarchy; version 1 and bounded unversioned snapshots replay as flat task lists.

Unversioned snapshots accept up to 10,000 tasks and 8 MiB of state. Versioned and unversioned snapshots allow an additional 64 KiB for result parameters and errors, without increasing task capacity. Oversized unversioned state remains readable but cannot be extended beyond current limits.

The extension displays the widget, task browser, and working-message contribution after removing terminal controls from task text. Saving in `/working-message` writes ordering to the displayed global or trusted project `settings.json`, preserving unrelated settings. Task and widget commands perform no independent file writes. There are no network requests.

## Validation

Run `vpr 'pi-todo#check'` and `vpr 'pi-todo#test'` from the workspace root. See the [workspace workflow](../../../docs/development.md#focused-validation).

For interactive changes, check `/todos` navigation and cancellation in regular and fullscreen modes. Include remapped selection and paging keys, narrow-terminal resizing, and widget restoration in a real Pi session.

### Working-message fixture

Launch the isolated, offline fixture from the workspace root in each mode:

```sh
vpr 'pi-todo#validate:terminal' regular
vpr 'pi-todo#validate:terminal' fullscreen
```

The launcher prints and retains its temporary directory without loading user settings or credentials. To reuse saved settings, place `--reuse <directory>` after the mode argument. Sessions are not saved across process restarts, so submit `seed` again when checking task activity.

When a command argument completion is selected, Enter accepts it. Press Enter again to execute the command.

1. Submit `seed` to create an in-progress task. Submit `hold` to show the working message for 30 seconds. Expect `Checking composition · Other status`. Escape cancels the wait.
2. During `hold`, open `/working-message`. Check the active contributions, `fixture.inactive`, and `unavailable.activity`. Use Up or Down to select and Shift+Up or Shift+Down to move an item. Confirm the working message stays unchanged while editing. Resize to a narrow terminal. Close with Escape and reopen to confirm the unsaved order was discarded.
3. Use Tab to switch scopes and Ctrl+S to save different global and project orders. Confirm that saving global order leaves the project override active. Reopen the menu and restart with `--reuse <directory>` to check saved orders and retained unavailable IDs.
4. To check save errors, open the menu and make a draft change. In another editor, set `workingMessage.order` to `123` in the displayed fixture settings file. Press Ctrl+S. Expect an error with the draft intact and the file unchanged by the save. Restore the valid array and retry.
5. Run `/todos expand` and `/todos collapse`, using `hold` after each to confirm `Other status` remains. `/fixture-status` clears that contribution, while `/fixture-status Other status` restores it. With the widget expanded and the other contribution cleared, `hold` must show Pi's default message.
6. Collapse the widget and restore `Other status`. Check that `/reload` restores task activity without duplicate components. Check that `/new` clears old task activity. Use `hold` after each to inspect the message.
