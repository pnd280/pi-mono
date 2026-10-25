# Bounded stream output

[Library index](../../README.md#usage)

A tool that shows process output must keep memory bounded while the output arrives in byte chunks that can split UTF-8 characters. [`@pi-mono/libs/output-buffer`](index.ts) exports `OutputBuffer`, which accepts byte chunks and decodes UTF-8 across chunk boundaries.

## Behaviour

The buffer retains full output through `maxBytes` raw bytes. Beyond that, it keeps `edgeLines` completed lines at each end and clips each line to `lineBytes`, split between its head and tail.

- Excerpt limits are independent of `maxBytes`.
- Generated notices add to source limits.
- `finish()` flushes incomplete UTF-8.

## Usage

```ts
import { OutputBuffer } from "@pi-mono/libs/output-buffer";

const stderr = new OutputBuffer({
  maxBytes: 64 * 1024,
  edgeLines: 20,
  lineBytes: 1024,
  formatOmission: ({ count, unit }) => ({ text: `[${count} stderr ${unit} omitted]` })
});

child.stderr.on("data", (chunk: Buffer) => stderr.append(chunk));
child.stderr.on("end", () => {
  stderr.finish();
  show(stderr.snapshot()); // OutputText: text plus notice ranges
});
```

## Caller responsibilities

- Sanitise each complete snapshot for terminal display.
- Preserve the notice ranges in `OutputText` to distinguish notices from identical process output.
- Use one instance per stream.
- Append new chunks, never replacement snapshots.
- End with `finish()`, then `snapshot()`.
- Supply omission messages and positive safe-integer `maxBytes`, `edgeLines`, and `lineBytes`. Other limits throw `RangeError`.

Related: tool display's [native observation](../../../extensions/pi-tool-display/src/observation/native.ts) supplies stream limits and omission messages, and [pi-subagents](../../../extensions/pi-subagents/src/child/connection.ts) bounds child stderr with the library.
