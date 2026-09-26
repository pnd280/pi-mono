# Settings-file access

[@pi-mono/libs](../../README.md)

## Behavior

`readSettingsFile(path)` accepts regular files up to 1 MiB (`MAX_SETTINGS_FILE_BYTES`), following symlinks and decoding their contents as UTF-8. It returns `undefined` for non-files, oversized files, or a read byte count different from the initial file size. I/O errors, including a missing file, throw. It does not parse JSON or apply defaults.

`readSettingsRecord(path)` additionally parses a JSON object. A missing file returns `{}`; malformed, unreadable, non-object, oversized, or non-regular inputs throw. It does not apply extension-specific defaults. `isSettingsRecord(value)` validates a record without replacing it, so saves can preserve every unrelated own key in a settings section.

`updateSettingsRecord(path, update)` holds Pi's `proper-lockfile` lock (`realpath: false`) around a fresh record read, caller mutation, and atomic rename. It preserves unrelated fields unless the mutator changes them, follows existing settings symlinks without replacing them, rejects dangling symlinks, preserves existing mode bits, and creates new files with mode `0600` subject to platform semantics. Serialized output is also limited to 1 MiB. Rejected mutations leave the original file untouched; temporary files and locks are released on exit. The helper may create parent directories but never repairs malformed JSON implicitly.

These record helpers are shared by [working-message ordering](../working-message/README.md#persistence) and [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration).

## Caller responsibilities

Validate the parsed settings section and decide whether to ignore invalid files or disable a feature. Only access project settings after establishing project trust; these helpers do not enforce scope or trust. Mutators own their section schema and whether invalid preferences can be replaced. Present sanitized, consumer-specific read/write diagnostics without exposing settings contents.

## Validation

Run `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'` from the repository root, then check affected consumers. [Reader tests](index.test.ts) cover bounded file access; [transaction tests](transaction.test.ts), [working-message settings tests](../working-message/settings.test.ts), and [widget settings tests](../../../extensions/pi-editor-widgets/src/settings.test.ts) cover locks, rejected writes, file modes, symlinks, scope validation, and unrelated fields.
