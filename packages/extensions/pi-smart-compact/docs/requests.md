# Compaction requests

[pi-smart-compact](../README.md)

The `compact` tool asks Pi to compact; it does not confirm that compaction succeeded. Only the model can call it directly. For the tool's purpose and an example, see [usage](../README.md#compact).

## What happens after a request

1. Pi saves the results of every tool call in the model's current response, the _tool batch_.
2. Before the next model response, Pi tries to compact, using its native summary and entry.
3. If the attempt is skipped, cancelled, or fails, a `pi-smart-compact.result` status message tells the model what happened. It does not start another turn.
4. The task continues unless the whole run is aborted or an unexpected exception stops it. In print mode, Pi waits for the task's final response.

## Other behaviour

- `instructions` add focus to Pi's default summaries, both of the history and of a single turn too long to keep whole (a _split turn_), without replacing their format.
- Several `compact` calls in one tool batch produce a single attempt. The last call's instructions, or lack of them, win.
- Pressing **Escape** during compaction cancels the compaction, not the agent run.
- An explicit request ignores the automatic token threshold and `compaction.enabled`, without changing them.
- `session_before_compact` handlers from other extensions can still cancel compaction or supply their own summaries.
- SDK callers must await each manual compaction before they start another. Concurrent calls can fail in Pi's native compaction state.

## Failed attempts

- An unavailable model, unsupported thinking level, authentication error, or failed summary never falls back silently to another model.
- Overflow recovery also covers responses that stopped at the output-length limit and can be recovered.
- If Pi removed the failed request from model context before recovery, that removal stays if compaction fails.

For settings problems that make `compact` unavailable, see [errors](configuration.md#errors).
