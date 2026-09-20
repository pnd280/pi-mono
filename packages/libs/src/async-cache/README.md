# Asynchronous cache

[Library index](../../README.md#usage)

## Behavior

[`AsyncCache`](index.ts) (`@pi-mono/libs/async-cache`) shares same-key loads in a bounded LRU cache. At the pending limit, new keys get uncached `onBusy` results or `undefined`. Rejections are uncached and retryable.

Disposal clears values and drops late results without aborting I/O or invoking `onEvict`; later loads return `undefined`.

## Caller responsibilities

Supply a loader and positive safe-integer cache/pending limits; invalid limits throw `RangeError`. Keep `onBusy`/`onEvict` nonthrowing. Own lifetime, retries, diagnostics, and resource/I/O cleanup; `dispose()` on closure.

Tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) supplies preview limits and a retryable busy result.

## Validation

Use the [package validation commands](../../README.md#validation).
