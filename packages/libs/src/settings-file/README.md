# Settings-file access

[Library index](../../README.md#usage)

Read and update JSON settings files such as Pi's `settings.json`. The library is used by [working-message ordering](../working-message/README.md#persistence), [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration), and the `ext.<package>` settings of other extensions.

## Behaviour

Reads return current content without changing the file. Section saves apply one locked change.

### Scopes

[`settingsPaths`](scopes.ts) returns the global path, `<agentDir>/settings.json`, and the project path, `<cwd>/.pi/settings.json`. Settings in parent directories never apply. `agentDir` defaults to Pi's agent directory.

[`readScopedSettings`](scopes.ts) calls your reader for the global path, then for the project path only when `projectTrusted` is true. It returns `[global, project]`; `project` is absent for an untrusted project. Your reader decides how to parse, validate, and handle failures, and you decide how the project result overrides the global one.

### Reads

| Function                               | Returns                                                          | Missing file | Empty file | Unreadable | Nonregular, over 1 MiB, or changed during the read | Malformed JSON |
| -------------------------------------- | ---------------------------------------------------------------- | ------------ | ---------- | ---------- | -------------------------------------------------- | -------------- |
| [`readSettingsFile`](read.ts)          | Bounded UTF-8 text from a regular file, not parsed or defaulted. | Throws       | `""`       | Throws     | `undefined`                                        | Not parsed     |
| [`readSettingsRecord`](transaction.ts) | A parsed JSON object. Pi's leading BOM is accepted.              | `{}`         | `{}`       | Throws     | Throws                                             | Throws         |

### Sections

[`settingsSection`](section.ts) loads and saves one field of a top-level settings section, such as `layout` in `ext.pi-editor-widgets`, in both scopes. Besides the scope options, it takes the section `key`, the `field`, the field's zod `schema`, an `invalidValue` error message, and a `loadWarning(path)` message.

- `load()` returns `{ global, project, warnings }` and never writes. It reads the project file only when `projectTrusted` is true.
- A missing section or field loads as `undefined`.
- An unreadable file, a section that is not an object, or a field that fails the schema also loads as `undefined`, and adds one `loadWarning` for its terminal-safe path.
- `save(scope, value)` refuses a project save in an untrusted project, then throws `invalidValue` for a value that fails the schema. Neither case touches the file.
- A save replaces only its field, including an invalid old value, and keeps the rest of the section. It refuses a section that is not an object instead of repairing it.
- A failed update throws `Check access, JSON, size and locks.`, with the terminal-safe file path on the next line.
- `paths` and `projectTrusted` expose the destinations and the trust decision, for example to label menu scopes.

### Updates

A section save runs one locked update:

1. Takes a lock.
2. Reads the file again while holding the lock.
3. Replaces the field.
4. Replaces the file atomically.

- If another writer holds the lock, the save throws without retrying.
- Existing settings symlinks are followed, not replaced.
- Unrelated fields and existing mode bits are kept.
- Malformed JSON and dangling links are refused, never repaired.
- Parent directories can be created. New files use mode `0600`, subject to the platform.

### Limits

Reads and serialised writes are limited to 1 MiB.

## Caller responsibilities

- Pass `ctx.isProjectTrusted()` as `projectTrusted`. The read functions don't check trust, so open project settings with them only after you establish project trust.
- Use a top-level key that your feature owns, such as `ext.<package>`.
- For sections, give the schema the field's limits, and word `invalidValue` and `loadWarning` for your feature.
- For other reads, validate the parsed settings, and decide whether an invalid file is ignored or disables the feature. Show sanitised diagnostics specific to your feature, without exposing settings contents.

## Validation

Use [package validation](../../README.md#validation) and check affected consumers. Edge cases are tested in the [transaction tests](transaction.test.ts) and [section tests](section.test.ts).
