# Bounded file output

[Library index](../../README.md#usage)

Preview a regular file when only bounded excerpts from the start and end are needed.

## Behaviour

[`readBoundedOutput`](index.ts) (`@pi-mono/libs/bounded-output`) previews regular files with bounded excerpts from the start and end. Generated omission notices can exceed source limits; omitted-byte counts include incomplete UTF-8 at clipped boundaries.

Reads follow symlinks without permission repair. Nonregular files, including FIFOs, return `not-file` without blocking. I/O failures return `unavailable` without OS diagnostics. Size and timestamp checks are not atomic snapshots. Callers decide whether to retry `changed` or `unavailable` results.

## Caller responsibilities

- Authorise paths before reading.
- Supply omission messages, and safe-integer byte and line limits of at least two. Other limits throw `RangeError`.
- Preserve `OutputText` notice ranges to distinguish notices from identical file text.
- Sanitise complete previews for display.

Choose retries, diagnostics, and cache lifetime. Tool display's [saved-output reader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) uses this library, and its [saved-output cache](../../../extensions/pi-tool-display/src/transcript/saved-output.ts) shares the reads through an [asynchronous cache](../async-cache/README.md).

Use [file observation](../file-observation/README.md) when complete source is required, [bounded stream output](../output-buffer/README.md) for incoming chunks, or [private files](../private-files/README.md) for storage with permission enforcement.
