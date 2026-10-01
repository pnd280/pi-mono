# Exact file observation

[Library index](../../README.md#usage)

Read a complete file as UTF-8 when a bounded preview is not enough.

## Behaviour

[`observeTextFile`](index.ts) (`@pi-mono/libs/file-observation`) reads complete UTF-8, preserving BOMs and rejecting invalid, nonregular, or oversized input. It follows symlinks without permission repair. Size and timestamp checks are not atomic snapshots.

## Caller responsibilities

Authorise paths, supply nonnegative safe-integer `maxBytes` (otherwise `RangeError`), and translate statuses into diagnostics.

Use [bounded file output](../bounded-output/README.md) when a preview is sufficient or [private files](../private-files/README.md) for storage with permission enforcement. Complete source can be passed to [bounded patch generation](../bounded-diff/README.md).

## Validation

Use the [package validation commands and prerequisites](../../README.md#validation).
