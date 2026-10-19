# Bounded stream output

[Library index](../../README.md#usage)

Retain bounded output from a byte stream that arrives in chunks.

## Behaviour

[`@pi-mono/libs/output-buffer`](index.ts) exports `OutputBuffer`, which accepts byte chunks and decodes UTF-8 across chunk boundaries.

The buffer retains full output through `maxBytes` raw bytes. Beyond that, it keeps `edgeLines` completed lines at each end and clips each line to `lineBytes`, split between its head and tail. Excerpt limits are independent of `maxBytes`. Generated notices add to source limits. `finish()` flushes incomplete UTF-8.

## Caller responsibilities

Use one instance per stream. Append new chunks, never replacement snapshots. End with `finish()`, then `snapshot()`. Supply omission messages and positive safe-integer `maxBytes`, `edgeLines`, and `lineBytes`; other limits throw `RangeError`.

Preserve the notice ranges in `OutputText` to distinguish notices from identical process output. Sanitise each complete snapshot for terminal display.

Tool display's [native observation](../../../extensions/pi-tool-display/src/observation/native.ts) supplies stream limits and omission messages.
