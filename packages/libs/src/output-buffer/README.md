# Bounded stream output

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/output-buffer`](index.ts) exports `OutputBuffer`, which accepts byte chunks and decodes UTF-8 across chunk boundaries.

It retains full output up to `maxBytes` raw input bytes, then keeps head and tail excerpts, including any incomplete final line. Excerpt size depends on `edgeLines` and `lineBytes`, independently of `maxBytes`.

Snapshots preserve generated omission ranges in `OutputText`. Generated notices can make the result exceed the source limits.

`finish()` flushes incomplete UTF-8 input. Later appends are ignored.

## Caller responsibilities

Use one instance per stream. Append only new chunks, not replacement snapshots. When the stream ends, call `finish()`, then take the final `snapshot()`.

Choose retention limits and omission messages. `maxBytes`, `edgeLines`, and `lineBytes` must be positive safe integers. Invalid limits throw `RangeError`.

Preserve the notice ranges in `OutputText` to distinguish notices from identical process output. Sanitize each complete snapshot for terminal display.

Tool display's [output policy](../../../extensions/pi-tool-display/src/observation/output-policy.ts) supplies stream limits and omission messages. For regular-file previews, use [bounded file output](../bounded-output/README.md).

## Validation

Use the [package validation commands](../../README.md#validation).
