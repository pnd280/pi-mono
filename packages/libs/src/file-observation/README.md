# Exact file observation

[Library index](../../README.md#usage)

Read a complete file as UTF-8 when a bounded preview is not enough.

## Behaviour

[`observeTextFile`](index.ts) (`@pi-mono/libs/file-observation`) reads complete UTF-8, preserving BOMs and rejecting invalid, nonregular, or oversized input. It follows symlinks without permission repair. Size and timestamp checks are not atomic snapshots.

`decodeTextFile` applies the same size and UTF-8 rules to bytes that the caller already read.

## Caller responsibilities

Authorise paths, supply a nonnegative safe-integer `maxBytes`, and translate statuses into diagnostics. Any other `maxBytes` value throws `RangeError`.

Use [bounded file output](../bounded-output/README.md) when a preview is sufficient or [private files](../private-files/README.md) for storage with permission enforcement. Complete source can be passed to [bounded patch generation](../bounded-diff/README.md).
