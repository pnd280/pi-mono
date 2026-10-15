# The todo tool

[pi-todo](../README.md)

The model changes todos only through the `todo` tool. You follow its work in the widget and the `/todos` browser, which the [package README](../README.md) describes.

## Actions

The model calls the `todo` tool with one of these actions: `create`, `update`, `list`, `get`, `delete`, and `clear`. The tool can only be called by the model directly, not through other tools, so every change leaves a snapshot that can be replayed.

## Parameters

The [tool schema](../src/tool-schema.ts) holds the model-facing descriptions and field limits.

| Parameter                         | Actions                   | Meaning                                                                                 |
| --------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `action`                          | All                       | The action to run.                                                                      |
| `id`                              | `update`, `get`, `delete` | The todo ID. Required for these actions.                                                |
| `subject`                         | `create`, `update`        | The subject line. Required for `create`.                                                |
| `description`                     | `create`, `update`        | A long-form description.                                                                |
| `inProgressLabel`                 | `create`, `update`        | The activity label shown while the todo is `in_progress`, such as `writing tests`.      |
| `status`                          | `update`, `list`          | `pending`, `in_progress`, `completed`, or `deleted`. On `list`, it filters the results. |
| `parentId`                        | `create`, `update`        | The parent todo ID, or `null` for the top level.                                        |
| `blockedBy`                       | `create`                  | The IDs of todos that block the new todo.                                               |
| `addBlockedBy`, `removeBlockedBy` | `update`                  | The IDs of blocking todos to add or remove.                                             |
| `owner`                           | `create`, `update`        | The agent or owner assigned to the todo.                                                |
| `metadata`                        | `create`, `update`        | Arbitrary JSON. On `update`, a key with a `null` value deletes that key.                |
| `includeDeleted`                  | `list`                    | If `true`, `list` also returns deleted todos. The default is `false`.                   |

## Rules

- A todo's subject can't be empty.
- New todos start as `pending`. Completed todos can't go back to `pending` or `in_progress`.
- Todos can be nested. On `update`, `parentId: null` moves a todo and its children to the top level.
- A todo can be _blocked by_ others. Cycles of blocking todos aren't allowed.
- A parent's status and blockers don't affect its children.
- `delete` leaves a hidden marker (a _tombstone_). `list` hides deleted todos unless `includeDeleted: true`.
- A todo with children that are not deleted can be moved but not deleted.
- `clear` removes everything and resets IDs.
- `list` shortens its displayed output, but the result details keep the full snapshot.
- [Limits](../src/state/limits.ts) on input and state also apply when results are replayed.

## Tool cards

The extension draws no tool cards. [pi-tool-display](../../pi-tool-display/src/adapters/pi-todo/README.md) draws them with the shortened subjects, status words, and progress summary from the pure [`pi-todo/text`](../src/text.ts) export.

## Replay

When a session starts or reloads, on branch changes, and after compaction, the latest valid `todo` result on the current branch is replayed. Malformed snapshots and host errors are skipped.

| Snapshot format     | Replayed as                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Version 2           | A nested list.                                                                                          |
| Version 1           | A flat list.                                                                                            |
| Unversioned (older) | A flat list. Readable under larger replay limits, but an oversized list can't grow past current limits. |
