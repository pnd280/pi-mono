# Scripted validation streams

[Library index](../../../README.md#offline-validation)

## Behavior

Validation-only [`@pi-mono/libs/validation/provider`](index.ts) creates messages with independent usage objects and runs scripted Pi event streams. `createFixtureStream` checks cancellation before/after scenarios without interrupting them. No provider registration or network transport.

## Caller responsibilities

Supply the fixture model, register the offline provider, and define scenarios, delays, and tool calls in the consumer. Pass the stream signal to scenario waits and I/O for cooperative cancellation.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures select their own offline providers and Pi resource flags.

## Validation

Use the [package validation commands](../../../README.md#validation).
