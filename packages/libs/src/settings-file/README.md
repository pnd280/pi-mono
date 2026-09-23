# Settings-file reader

[@pi-mono/libs](../../README.md)

## Behavior

`readSettingsFile(path)` accepts regular files up to 1 MiB (`MAX_SETTINGS_FILE_BYTES`), following symlinks and decoding their contents as UTF-8. It returns `undefined` for non-files, oversized files, or a read byte count different from the initial file size. I/O errors, including a missing file, throw. It does not parse JSON or apply defaults.

## Caller responsibilities

Validate the parsed settings section and decide whether to ignore invalid files or disable a feature. Only read project settings after establishing project trust; this reader does not enforce scope or trust.

## Validation

Run `vpr '@pi-mono/libs#check'` and `vpr '@pi-mono/libs#test'` from the repository root, then check affected consumers.
