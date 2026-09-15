# Exact file observation

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/file-observation`](index.ts) exports `observeTextFile`, which reads complete UTF-8 source without clipping. It preserves BOMs and refuses invalid UTF-8, nonregular files, and oversized files.

Reads follow symlinks and never repair permissions. Size and timestamp checks detect some concurrent changes but do not guarantee an atomic snapshot.

## Caller responsibilities

Decide which paths the consumer may read and choose the source byte limit. Translate result statuses into diagnostics in the consumer.

Use [bounded file output](../bounded-output/README.md) when a preview is sufficient or [private files](../private-files/README.md) for storage with permission enforcement. Complete source can be passed to [bounded patch generation](../bounded-diff/README.md).

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
