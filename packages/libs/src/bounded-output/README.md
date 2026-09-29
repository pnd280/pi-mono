# Bounded file output

[Library index](../../README.md#usage)

## Behavior

[`readBoundedOutput`](index.ts) (`@pi-mono/libs/bounded-output`) previews regular files with bounded head/tail excerpts. Generated omission notices can exceed source limits; omitted-byte counts include incomplete UTF-8 at clipped boundaries.

Reads follow symlinks without permission repair. Size/timestamp checks are not atomic snapshots; callers decide whether to retry changed/unavailable results.

## Caller responsibilities

Authorize paths before reading; supply omission messages and safe-integer byte/line limits of at least two. Preserve `OutputText` notice ranges to distinguish identical file text; sanitize complete previews for display.

Choose retries, diagnostics, and cache lifetime. Tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) combines this reader with an [asynchronous cache](../async-cache/README.md).

Use [file observation](../file-observation/README.md) when complete source is required, [bounded stream output](../output-buffer/README.md) for incoming chunks, or [private files](../private-files/README.md) for storage with permission enforcement.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
