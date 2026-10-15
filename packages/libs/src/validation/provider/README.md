# Scripted validation streams

[Offline validation](../../../README.md#offline-validation)

Drive validation scenarios with scripted assistant messages and event streams.

## Behaviour

Validation-only [`@pi-mono/libs/validation/provider`](index.ts) builds scripted Pi event streams; it registers no provider or network transport. Messages stay `pending` until the scenario completes, fails, or is cancelled. `createFixtureStream` checks cancellation before and after the caller's `run` callback, not during it.

## Caller responsibilities

Supply the fixture model, register the offline provider, and define scenarios, delays, and tool calls in the consumer. Pass the stream signal to scenario waits and I/O for cooperative cancellation.

The [prompt-manager](../../../../extensions/pi-prompt-manager/validation/provider.ts) and [tool-display](../../../../extensions/pi-tool-display/validation/provider.ts) fixtures register offline providers that use these streams. Their workspace fixtures select those providers and Pi resource flags.
