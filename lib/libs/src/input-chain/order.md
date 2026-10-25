# Input-chain placement and ranks

[Input chain](README.md)

Read this when you choose a transform rank or debug how the chain meets other `input` handlers. For liveness, order rules, and disposal, see the [coordinator protocol](../coordination/README.md).

## Chain placement

Every participant registers an `input` handler, and the first one in each emission runs the chain. The chain therefore runs at the first live participant's place among Pi's `input` handlers. Extensions that do not participate still run in load order around it.

## Version mismatch

After a [version mismatch](../coordination/README.md#version-mismatch), each participant's `input` handler runs only its own observers and transforms, so participants run in load order.

## Recommended ranks

Leave gaps between ranks so that new participants can fit between existing ones. Each participant states its reasons in its own documentation.

| Participant       | Registration       |
| ----------------- | ------------------ |
| pi-prompt-manager | Observer           |
| pi-skills         | Transform at `100` |
