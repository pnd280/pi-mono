# Prompt-part placement and ranks

[Prompt parts](README.md)

Read this when you choose a part rank or debug how the parts meet other `before_agent_start` handlers. For liveness, order rules, and disposal, see the [coordinator protocol](../coordination/README.md).

## Part placement

Every participant registers a `before_agent_start` handler, and the first one in each run appends the parts. The parts therefore arrive at the first live participant's place among Pi's `before_agent_start` handlers. Participants can keep their own `before_agent_start` handlers for other work.

## Version mismatch

After a [version mismatch](../coordination/README.md#version-mismatch), each participant's handler waits only for its own holds and appends only its own parts, so parts follow load order.

## Recommended ranks

Each participant states its reasons in its own documentation.

| Participant     | Rank  |
| --------------- | ----- |
| pi-model-prompt | `100` |
| pi-profiles     | `200` |
