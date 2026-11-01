# Settings-file reads and saves

[Settings-file access](README.md)

This reference is for library callers who need the exact read results, section rules, and save steps. The [README](README.md#behaviour) summarises them.

## Scopes

[`settingsPaths`](scopes.ts) returns the global path, `<agentDir>/settings.json`, and the project path, `<cwd>/.pi/settings.json`. Settings in parent directories never apply. `agentDir` defaults to Pi's agent directory.

[`readScopedSections`](scopes.ts) reads one top-level key, such as `ext.<package>`, from the global path, then from the project path only when `projectTrusted` is true. It returns `[global, project]`; `project` is absent for an untrusted project. Each entry has its `scope` and `path`, and one of two results:

- `status: "read"` with the key's unvalidated `value`. The `value` is `undefined` when the file or the key is missing.
- `status: "unreadable"` when `readSettingsRecord` throws for the file.

You validate each value, decide how to handle an unreadable file, resolve relative paths from the entry's `path`, and decide how the project value overrides the global one.

## Reads

Reads never write. These functions read at most 1 MiB for each file.

| Function                               | Returns                                                          | Missing file       | Empty file         | Unreadable   | Nonregular, invalid UTF-8, over 1 MiB, or read length differs from initial size | Malformed JSON or not an object |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------ | ------------------ | ------------ | ------------------------------------------------------------------------------- | ------------------------------- |
| [`readSettingsFile`](read.ts)          | Bounded UTF-8 text from a regular file, not parsed or defaulted. | Throws             | `""`               | Throws       | `undefined`                                                                     | Not parsed                      |
| [`readSettingsRecord`](transaction.ts) | A parsed JSON object. Pi's leading BOM is accepted.              | `{}`               | `{}`               | Throws       | Throws                                                                          | Throws                          |
| [`readScopedSections`](scopes.ts)      | One key's value in each trusted scope; see [Scopes](#scopes).    | `value: undefined` | `value: undefined` | `unreadable` | `unreadable`                                                                    | `unreadable`                    |

## Section loads and saves

[`settingsSection`](section.ts) takes the scope options, the section `key`, the `field`, the field's zod `schema`, an `invalidValue` error message, and a `loadWarning(path)` message.

- `load()` returns `{ global, project, warnings }` and never writes. It reads the project file only when `projectTrusted` is true.
- A missing section or field loads as `undefined`.
- An unreadable file, a section that is not an object, or a field that fails the schema also loads as `undefined`, and adds one `loadWarning` for its terminal-safe path.
- `save(scope, value)` refuses a project save in an untrusted project, then throws `invalidValue` for a value that fails the schema. Neither case touches the file.
- A save replaces only its field, including an invalid old value, and keeps the rest of the section. It refuses a section that is not an object instead of repairing it.
- A failed update throws `Check access, JSON, size and locks.`, followed by a line with `File: ` and the terminal-safe file path.
- `paths` and `projectTrusted` expose the destinations and the trust decision, for example to label menu scopes.

## Locked updates

A section save runs one locked update:

1. Takes a lock.
2. Reads the file again while holding the lock.
3. Replaces the field.
4. Replaces the file atomically.

- If another writer holds the lock, the save throws without retrying.
- Unrelated fields and existing mode bits are kept.
- Malformed JSON, invalid UTF-8, and dangling links are refused, never repaired.
- Parent directories can be created. New files use mode `0600`, subject to the platform.
- Serialised writes are limited to 1 MiB.

### Symlinks

- Existing settings symlinks are followed, not replaced.
- A save through a symlink locks both the link path, as Pi does, and the link's final target. This excludes another save through this library, also one through a different alias of the same file.
- Pi's own settings writer locks only the path it uses, so it is excluded when it uses the same link path or the target path, but not when it uses a different symlink.
- If the symlink changes while the save takes its locks, the save throws.
