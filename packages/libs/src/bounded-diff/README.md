# Bounded patch generation

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/bounded-diff`](index.ts) exports `createBoundedPatch` to generate a unified patch. It normalizes CRLF to LF and refuses NUL-containing source.

Generation is synchronous and checks the clock to enforce its timeout. Results distinguish oversized source, oversized patches, and binary input. Exceeding either the edit-distance limit or the timeout returns `budget-exceeded`.

## Caller responsibilities

Supply the path and source before and after the change. Choose source and patch byte limits, an edit-distance limit, a timeout, and the number of context lines. The library does not read files. Use [file observation](../file-observation/README.md) when complete UTF-8 source must be loaded from disk.

Classify the change and translate result statuses into diagnostics in the consumer. Patch parsing belongs to [`@pi-mono/utils/patch`](../../../utils/src/patch.ts), and rendering belongs to the [diff view](../tui/components/diff-view/README.md).

## Validation

Use the [package validation commands](../../README.md#validation).
