# pi-todo

Track multi-step work with session-backed tasks, an above-editor progress widget, and a read-only `/todos` browser. The extension activates only for interactive TTY sessions, including regular and fullscreen modes. It stays inactive for print, JSON, RPC, and informational CLI invocations.

## Usage

The `todo` tool supports `create`, `update`, `list`, `get`, `delete`, and `clear`. New tasks are pending. Updates can change fields, status, dependencies, or `parentId`; `parentId: null` moves a subtree to the root. Hierarchy is organizational: parent status and dependencies do not control children. Dependencies cannot form cycles. A task with non-deleted descendants cannot transition to `deleted`. It can still be reparented.

`/todos` opens the hierarchy. Use the configured selection keys to navigate, Enter to inspect details, and Escape to return or close. Page keys scroll details or move selection. `/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session. When collapsed, Pi's working message shows the first in-progress task.

Deletion leaves a tombstone; `list` hides tombstones unless `includeDeleted: true`. `list` content is capped at 200 lines or 32 KiB; truncation appends the omitted count, and the result details still carry the complete snapshot. `clear` removes all tasks and resets IDs. Completed tasks cannot return to pending or in progress.

## Configuration

Set the literal `ext.pi-todo` key in Pi's global `settings.json` or the current directory's trusted `.pi/settings.json`:

```json
{
  "ext.pi-todo": {
    "widgetCollapsed": false
  }
}
```

`widgetCollapsed` defaults to `false`. A trusted project field overrides the global field. An invalid section is ignored. Settings are reloaded on session start; widget commands do not write settings.

## Side effects

Tool-result details persist complete task snapshots in Pi's session and are the only durable task storage. Branch changes and compaction reconstruct state from the latest valid result, skipping malformed snapshots and host errors. Version 2 retains hierarchy; version 1 and bounded unversioned snapshots replay as flat task lists.

Current limits are 1,000 tasks including tombstones, eight hierarchy levels, and 100 dependencies per task. Subjects, in-progress labels, and owners allow 200 characters each. Descriptions allow 4,000 characters. Metadata allows 16 KiB and eight levels. Stored task state allows 512 KiB. Legacy replay accepts up to 10,000 tasks and 8 MiB of state. Both formats allow an additional 64 KiB for the result envelope, including parameters and errors, without increasing task capacity. Oversized legacy state remains readable but cannot be extended beyond current limits. Terminal controls are removed before displaying task text.

The extension registers UI components and changes the working message. It performs no network requests or independent file writes.

## Validation

Run `vpr 'pi-todo#check'` and `vpr 'pi-todo#test'` from the workspace root. See the [workspace workflow](../../../docs/development.md#focused-validation).

For interactive changes, check `/todos` navigation and cancellation in regular and fullscreen modes, including remapped selection paging keys, narrow-terminal resizing, and widget restoration in a real Pi session.
