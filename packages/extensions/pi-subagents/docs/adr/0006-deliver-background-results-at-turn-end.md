# Deliver background results at the end of each turn

[pi-subagents](../../README.md#background-tasks)

A busy [supervisor](../../GLOSSARY.md#tasks-and-processes) received each [background result](../../GLOSSARY.md#results) only after the model's final reply, at `agent_before_settle` ([ADR 0001](0001-hold-run-for-background-results.md)). A model that works for many turns continued on old information until then, for example after a job's build failed or its server stopped.

## Decision

- With `resultDelivery: "turn_end"`, the default, the `turn_end` handler in [Delivery](../../src/delivery.ts) sends ready task and job results after a reply that stopped with `stop` or `toolUse`.
- It uses `sendMessage(message, { triggerTurn: false })`, so Pi saves the results with their message events after the `turn_end` handlers finish, before the next model request.
- The handler then returns `continue: true` to request another model response. Tool calls or queued input that already need a request satisfy it.
- The handler skips failed, aborted, and length-truncated replies, so Pi's retry and recovery run first. Their results stay in the delivery component.
- Results that arrive after the final turn take the path of ADR 0001: the `agent_end` wait and `agent_before_settle`. The wait, the idle wake, abort handling, and session-change handling do not change.
- `resultDelivery: "settle"` turns off the `turn_end` delivery, so results wait for `agent_before_settle`.

## Considered options

### Steer results with `sendMessage(message, { deliverAs: "steer" })`

Rejected. In Pi 1.2.0, Pi reads steering messages after the turn's complete tool batch, so steering delivers no earlier. During TUI streaming, **Esc** clears the agent's steering and follow-up queues but restores only queued user text to the editor, so an undelivered result is lost. The results would also share the user's steering queue and `steeringMode`.

### Return `custom_message` entry drafts from `turn_end`

Rejected. Pi commits boundary drafts with an `entry_appended` event only, and no `message_start` or `message_end` event. A supervisor adds a child's [late usage](../../GLOSSARY.md#results) to the live task total from the result's session `message_end` event, and RPC clients receive the same message events.

### Deliver only at `agent_before_settle`

Kept as the `settle` option, for users who want the model to finish its current work before it receives background results. See the [configuration trade-off](../../README.md#configuration).

## Consequences

- A result can arrive while the model works on something else, and the model can change direction.
- Earlier delivery can increase [input-token use](../../README.md#configuration).
- Delivery needs no extra model request when tool calls or queued input already need one. Otherwise, it requests one more response, for example after a final reply or after a tool batch that ends the loop.
- An abort after the handler sent results can end the run after Pi saves them but before the model reads them. The idle wake handles only the results that the delivery component still holds.
- A long tool call, such as a foreground subagent, delays delivery until its turn ends.
