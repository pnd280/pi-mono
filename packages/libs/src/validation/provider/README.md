# Scripted validation streams

[Library index](../../../README.md#offline-validation)

## Behavior

[`@pi-mono/libs/validation/provider`](index.ts) is for validation code only. It creates fixture messages with independent usage objects and runs scripted scenarios through Pi's message-event stream.

`createFixtureStream` checks cancellation before and after the scenario but does not interrupt scenario work.

The library does not register a provider or provide a network transport.

## Caller responsibilities

Supply the fixture model, register the offline provider, and define scenarios, delays, and tool calls in the consumer. Pass the stream signal to scenario waits and I/O for cooperative cancellation.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/workspace.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/workspace.ts) fixtures select their own offline providers and Pi resource flags.

## Validation

Use the [package validation commands](../../../README.md#validation).
