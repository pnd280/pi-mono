# Bounded file output

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/bounded-output`](index.ts) exports `readBoundedOutput` for regular-file previews. Oversized files retain head and tail excerpts within source byte and line limits. Generated omission notices can make the result exceed those limits.

Reads follow symlinks without repairing permissions. Size and timestamp checks detect some concurrent writes but do not guarantee an atomic snapshot. Results distinguish a ready preview, a nonregular file, a changed file, and an unavailable read without exposing raw OS diagnostics.

The library does not cache previews or retry reads.

## Caller responsibilities

Decide which paths the consumer may read before loading a preview. Supply omission messages and byte and line limits. Both limits must be safe integers of at least two. Invalid limits throw `RangeError`.

Preserve the notice ranges in `OutputText` to distinguish notices from identical file contents. Sanitize the complete preview for terminal display.

Choose retries, diagnostics, and cache lifetime. Tool display's [saved-output loader](../../../extensions/pi-tool-display/src/observation/saved-output.ts) combines this reader with an [asynchronous cache](../async-cache/README.md).

Use [file observation](../file-observation/README.md) when complete source is required, [bounded stream output](../output-buffer/README.md) for incoming chunks, or [private files](../private-files/README.md) for storage with permission enforcement.

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
