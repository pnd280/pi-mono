# Scripted validation streams

[Library index](../../../README.md#offline-validation)

## Behavior

Validation-only [`@pi-mono/libs/validation/provider`](index.ts) builds scripted Pi event streams; it registers no provider or network transport. `createFixtureStream` checks cancellation before and after the caller's `run` callback, not during it.

## Caller responsibilities

Supply the fixture model, register the offline provider, and define scenarios, delays, and tool calls in the consumer. Pass the stream signal to scenario waits and I/O for cooperative cancellation.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures select their own offline providers and Pi resource flags.
