# Asynchronous cache

[Library index](../../README.md#usage)

## Behavior

[`AsyncCache`](index.ts) (`@pi-mono/libs/async-cache`) shares same-key loads in a bounded LRU cache. At the pending limit, new keys get uncached `onBusy` results or `undefined`; failed loads can be retried.

Disposal does not abort underlying I/O or invoke `onEvict`.

## Caller responsibilities

Supply a loader and positive safe-integer cache/pending limits. Keep `onBusy`/`onEvict` nonthrowing. Own retries, diagnostics, and I/O cleanup; `dispose()` on closure.

See tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) for a consumer.
