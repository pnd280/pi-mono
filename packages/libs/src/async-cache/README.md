# Asynchronous cache

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/async-cache`](index.ts) exports `AsyncCache`, which shares pending loads for the same key and retains results in a bounded LRU cache.

At the pending-load limit, new keys receive an uncached `onBusy` result, or `undefined` if no callback is supplied. Rejected loads are not cached and can be retried.

Disposal clears retained values and discards late results without aborting underlying I/O or invoking `onEvict`. Loads after disposal return `undefined`.

## Caller responsibilities

Supply the loader, cache capacity, and pending-load limit. Keep `onBusy` and `onEvict` callbacks nonthrowing.

Choose cache lifetime, retry policy, and diagnostics. Call `dispose()` when the owner closes and clean up resources in the owner, including any I/O that must be aborted.

Tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) supplies preview limits and a retryable busy result.

## Validation

Use the [package validation commands](../../README.md#validation).
