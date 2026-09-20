# Bounded file output

[Library index](../../README.md#usage)

## Behavior

[`readBoundedOutput`](index.ts) (`@pi-mono/libs/bounded-output`) previews regular files, retaining oversized head/tail excerpts within byte/line limits. Omission notices can make previews exceed those limits.

Reads follow symlinks without permission repair. Size/timestamp checks detect some races, not atomic snapshots. Results distinguish ready, nonregular, changed, and unavailable without raw OS diagnostics. No caching or retries.

## Caller responsibilities

Authorize paths before reading; supply omission messages and safe-integer byte/line limits of at least two, or receive `RangeError`. Preserve `OutputText` notice ranges to distinguish identical file text; sanitize complete previews for display.

Choose retries, diagnostics, and cache lifetime. Tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) combines this reader with an [asynchronous cache](../async-cache/README.md).

Use [file observation](../file-observation/README.md) when complete source is required, [bounded stream output](../output-buffer/README.md) for incoming chunks, or [private files](../private-files/README.md) for storage with permission enforcement.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
