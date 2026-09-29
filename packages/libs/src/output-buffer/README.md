# Bounded stream output

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/output-buffer`](index.ts) exports `OutputBuffer`, which accepts byte chunks and decodes UTF-8 across chunk boundaries.

Retains full output through `maxBytes` raw bytes, then bounded head/tail excerpts. Excerpt limits are independent of `maxBytes`; generated notices add to source limits. `finish()` flushes incomplete UTF-8.

## Caller responsibilities

Use one instance per stream; append new chunks, never replacement snapshots. End with `finish()`, then `snapshot()`. Supply omission messages and positive safe-integer `maxBytes`, `edgeLines`, and `lineBytes`.

Preserve the notice ranges in `OutputText` to distinguish notices from identical process output. Sanitize each complete snapshot for terminal display.

Tool display's [output policy](../../../extensions/pi-tool-display/src/observation/output-policy.ts) supplies stream limits and omission messages. For regular-file previews, use [bounded file output](../bounded-output/README.md).
