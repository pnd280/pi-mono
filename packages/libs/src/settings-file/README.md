# Settings-file access

[@pi-mono/libs](../../README.md)

## Behavior

[`readSettingsFile`](read.ts) reads bounded UTF-8 from regular files without parsing or defaulting; missing files and I/O errors throw. [`readSettingsRecord`](transaction.ts) parses a JSON object (including Pi's leading BOM); missing or empty files yield `{}`, while malformed or unreadable records throw.

`isSettingsRecord` validates without replacing the object, allowing saves to preserve unrelated own keys.

[`updateSettingsRecord`](transaction.ts) locks around a fresh read, synchronous mutation, and atomic replacement. It follows existing settings symlinks without replacing them, preserves unrelated fields and existing mode bits, and refuses malformed JSON or dangling links rather than repairing them. It can create parent directories; new files use mode `0600` subject to platform semantics. Reads and serialized writes are limited to 1 MiB.

These record helpers are shared by [working-message ordering](../working-message/README.md#persistence) and [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration).

## Caller responsibilities

Validate the parsed settings section and decide whether to ignore invalid files or disable a feature. Only access project settings after establishing project trust; these helpers do not enforce scope or trust. Mutators own their section schema and whether invalid preferences can be replaced. Present sanitized, consumer-specific read/write diagnostics without exposing settings contents.

## Validation

Use [package validation](../../README.md#validation) and check affected consumers. [Reader tests](index.test.ts), [transaction tests](transaction.test.ts), [working-message settings tests](../working-message/settings.test.ts), and [widget settings tests](../../../extensions/pi-editor-widgets/src/settings.test.ts) own the edge cases.
