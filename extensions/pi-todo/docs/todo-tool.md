# The todo tool

[pi-todo](../README.md)

The model changes todos only through the `todo` tool. You follow its work in the widget and the `/todos` browser, which the [package README](../README.md) describes.

## Actions

The model calls the `todo` tool with one of these actions: `create`, `update`, `list`, `get`, `delete`, and `clear`. Only the model can call the tool, and only directly, not through other tools, so every change leaves a snapshot that can be replayed.

## Parameters

The [tool schema](../src/tool-schema.ts) holds the model-facing descriptions and applies the field [limits](#limits).

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
| `metadata`                        | `create`, `update`        | A JSON object. On `update`, a key with a `null` value deletes that key.                 |
| `includeDeleted`                  | `list`                    | If `true`, `list` also returns deleted todos. The default is `false`.                   |

## Rules

- A todo's subject can't be empty.
- New todos start as `pending`. Completed todos can't go back to `pending` or `in_progress`, and deleted todos can't change status.
- Todos can be nested. On `update`, `parentId: null` moves a todo and its children to the top level.
- A todo can be _blocked by_ others. Blockers record dependencies only: they don't restrict status changes, and completing or deleting a blocker leaves its ID in place. Cycles of blocking todos aren't allowed. A repeated ID in `blockedBy` or `addBlockedBy` counts as one blocker.
- A parent's status and blockers don't affect its children.
- `delete` leaves a hidden marker (a _tombstone_). `list` hides deleted todos unless `includeDeleted: true` or `status: "deleted"`.
- A todo with children that are not deleted can be moved but not deleted.
- `clear` removes everything and resets IDs.

## Limits

The tool refuses a call that would exceed one of these limits and leaves the todos unchanged. Lengths count UTF-16 code units. Pi checks the submitted text against these limits, and the tool checks the stored text again after it cleans it for terminal display.

| Limit             | Value                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Todos             | 1,000, including deleted todos until `clear`                                                             |
| Nesting depth     | 8 levels, counting the top level                                                                         |
| `subject`         | 200 code units                                                                                           |
| `description`     | 4,000 code units                                                                                         |
| `inProgressLabel` | 200 code units                                                                                           |
| `owner`           | 200 code units                                                                                           |
| Blocking todos    | 100 IDs in each of `blockedBy`, `addBlockedBy`, and `removeBlockedBy`, and 100 stored                    |
| `metadata`        | 16 KiB of JSON and 8 levels of nesting, for the submitted object and, on `update`, for the merged result |
| Saved todo state  | 512 KiB of JSON                                                                                          |

`list` returns at most 200 lines and 32,768 characters, including any omission notice. `get` returns the saved metadata as one line of JSON, shortened to 4,000 characters. In both cases the result details keep the full snapshot.

The same limits apply when results are replayed. The values are defined in [limits](../src/state/limits.ts).

## Tool cards

The extension draws no tool cards. [pi-tool-display](../../pi-tool-display/docs/tools.md#todo) draws them with the action and status names, shortened subjects, status words, and progress summary from the pure [`pi-todo/text`](../src/text.ts) export.

## Replay

When a session starts or reloads, on branch changes, and after compaction, the extension replays the latest valid `todo` result on the current branch as a nested list. It replays only version 2 snapshots within the current limits, and skips other formats, malformed snapshots, and host errors.
