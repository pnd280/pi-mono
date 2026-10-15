# Asynchronous cache

[Library index](../../README.md#usage)

Share one in-flight load across callers for the same key instead of starting duplicate I/O.

## Behaviour

[`AsyncCache`](index.ts) (`@pi-mono/libs/async-cache`) shares same-key loads in a bounded LRU cache. At the pending limit, new keys get uncached `onBusy` results or `undefined`. Failed loads can be retried.

Disposal does not abort underlying I/O or invoke `onEvict`.

## Caller responsibilities

Supply a loader and positive safe-integer `capacity` and `maxPending` limits; other limits throw `RangeError`. `onBusy` and `onEvict` must not throw. Own retries, diagnostics, and I/O cleanup. Call `dispose()` on closure.

See tool display's [saved-output cache](../../../extensions/pi-tool-display/src/transcript/saved-output.ts) for a consumer.
