# Count late background usage with a session-manager patch

[pi-subagents](../../README.md#side-effects)

A background or promoted call returns before its child finishes, so its tool result carries only the usage until the return. The rest reached the supervisor only in the details of the result custom message, which Pi does not count in session totals. Nested supervisors read child totals through `get_session_stats`, so the loss also propagated up the chain.

Pi counts `usage` session entries in `getSessionStats()`, the footer, and the cost breakdown, keeps them out of model context, and hides them in chat unless their kind is `cache_warm`. Pi's extension API exposes no usage writer for the current session. This package therefore wraps `SessionManager.prototype.appendCustomMessageEntry`: after Pi persists a result message whose details carry `late_usage`, the wrapper calls `appendUsage("pi-subagents.late", provider, model, usage)` on the same session manager.

- Every custom-message persistence path, including deferred, `nextTurn`, and settle-boundary messages, goes through this method, and each result is persisted once.
- Pi never persists a custom message between a tool call and its result, so the usage entry that follows it has the same safe position.
- A child supervisor writes its grandchild's late usage before its own run settles ([ADR 0001](0001-hold-run-for-background-results.md)), so its supervisor's usage difference includes it.
- While a run is active, its in-memory task record counts the same `late_usage` delta from the result's `message_end` event. Pi does not emit `entry_appended` for the wrapper's `appendUsage` call. The run's `end` entry then records the statistics difference, which includes the usage entry ([ADR 0003](0003-keep-task-history-in-child-sessions.md)).

## Considered options

- **Append the entry through `ctx.sessionManager`.** The extension context does not promise the full session manager, and the delivery path does not know when Pi persists a deferred message.
- **Add the late usage to a tool result.** The original call has already returned, and a new tool result would enter model context.

## Consequences

- The patch is process-wide and guarded by a `Symbol.for` marker, so reloads and several extension instances do not count usage twice. It acts only on result messages with valid `late_usage`.
- If Pi removes either method, the patch is skipped with a warning and totals exclude late usage as before. A changed argument order could write wrong data; the [compatibility checklist](../pi-compatibility.md) and e2e tests cover it.
- Late usage is not counted if the result is never delivered, such as a cancellation suppressed after `subagent_abort` or a result pending at shutdown. Usage already returned by the tool remains counted.
- Remove the patch when Pi's extension API can write usage entries at custom-message persistence or Pi counts usage on custom messages.
