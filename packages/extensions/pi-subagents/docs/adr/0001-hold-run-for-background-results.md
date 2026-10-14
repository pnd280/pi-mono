# Hold the supervisor's run until the first background result

[pi-subagents](../../README.md#background-tasks)

A supervisor that went idle received each background result through `wakeIdle()`, a workaround for [Pi issue #5581](https://github.com/earendil-works/pi/issues/5581) that added a synthetic user message to the transcript in Pi 1.0.2. To deliver results within the prepared run instead, the `agent_end` handler waits after a `stop` or `toolUse` reply until the first direct background task finishes, new input arrives, the run is aborted, or no background task remains; ready results then continue the same prepared run. This applies in all modes and at all depths.

Results remain in the delivery component until `agent_before_settle`, which publishes them with `sendMessage(message, { triggerTurn: false })` and returns `continue: true`. Pi flushes these custom messages before continuation, so the transcript receives their message events. A follow-up queued in `agent_end` can remain unconsumed after an abort. If an abort skips the settlement boundary, delivery retains the result for the idle handoff at `agent_settled`.

## Considered options

- **Wait only in `agent_before_settle`.** This was the earlier design for children and print/JSON. `ctx.signal` is `undefined` at that point, and no public event reports an abort, so a top-level wait could not end on **Esc**. It remains the fallback after a final error or `length` stop that Pi does not recover.
- **Wait in `turn_end`.** It also has a live signal, but it fires after every turn, so choosing the right turn needs more checks.
- **Keep `wakeIdle()` only.** It still delivers results that arrive after an abort or while idle.
- **Detect Esc through terminal input.** Rejected: it observes only one source of abort and duplicates Pi's input handling.

## Consequences

- Pi has no event for queued input, so the wait checks `ctx.hasPendingMessages()` every 250 ms.
- The wait is skipped for failed, aborted, and length-truncated replies, so Pi's retry and recovery run first.
- Busy time includes the wait, and commands that need an idle session are blocked until it ends.
- After an abort, the supervisor settles while tasks run, and N tasks can cause up to N later model requests.
- `subagent_abort` drops the task's cancelled result for the calling supervisor, because its model already has the confirmation. If the task finished before cancellation, the call reports that it is inactive and preserves the actual result.
- Descendant aborts use an acknowledged control request. The owning supervisor confirms the outcome or returns its error, and the cancellation reason reaches the child unchanged.
