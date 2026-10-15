# Settings-file access

[Library index](../../README.md#usage)

Read and update JSON settings files such as Pi's `settings.json`. The library is used by [working-message ordering](../working-message/README.md#persistence), [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration), and the `ext.<package>` settings of other extensions.

## Behaviour

Reads return current content without changing the file. Updates apply one locked change.

### Scopes

[`settingsPaths`](scopes.ts) returns the global path, `<agentDir>/settings.json`, and the project path, `<cwd>/.pi/settings.json`. Settings in parent directories never apply. `agentDir` defaults to Pi's agent directory.

[`readScopedSettings`](scopes.ts) calls your reader for the global path, then for the project path only when `projectTrusted` is true. It returns `[global, project]`; `project` is absent for an untrusted project. Your reader decides how to parse, validate, and handle failures, and you decide how the project result overrides the global one.

### Reads

| Function                               | Returns                                                          | Missing file | Empty file | Unreadable | Nonregular, over 1 MiB, or changed during the read | Malformed JSON |
| -------------------------------------- | ---------------------------------------------------------------- | ------------ | ---------- | ---------- | -------------------------------------------------- | -------------- |
| [`readSettingsFile`](read.ts)          | Bounded UTF-8 text from a regular file, not parsed or defaulted. | Throws       | `""`       | Throws     | `undefined`                                        | Not parsed     |
| [`readSettingsRecord`](transaction.ts) | A parsed JSON object. Pi's leading BOM is accepted.              | `{}`         | `{}`       | Throws     | Throws                                             | Throws         |

`isSettingsRecord` validates an object without replacing it, so saves can keep unrelated own keys.

### Updates

[`updateSettingsRecord`](transaction.ts):

1. Takes a lock.
2. Reads the file again while holding the lock.
3. Runs your synchronous change.
4. Replaces the file atomically.

- If another writer holds the lock, the update throws without retrying.
- If your change throws or returns a promise, nothing is written and the update throws.
- Existing settings symlinks are followed, not replaced.
- Unrelated fields and existing mode bits are kept.
- Malformed JSON and dangling links are refused, never repaired.
- Parent directories can be created. New files use mode `0600`, subject to the platform.

### Limits

Reads and serialised writes are limited to 1 MiB.

## Caller responsibilities

- Validate the parsed settings section, and decide whether an invalid file is ignored or disables the feature.
- Pass `ctx.isProjectTrusted()` as `projectTrusted`. Other helpers don't check trust, so open project settings with them only after you establish project trust.
- Mutators own their section's schema, and decide whether invalid preferences can be replaced.
- Show sanitised read and write diagnostics specific to your feature, without exposing settings contents.

## Validation

Use [package validation](../../README.md#validation) and check affected consumers. Edge cases are tested in the [transaction tests](transaction.test.ts), [working-message settings tests](../working-message/settings.test.ts), and [widget settings tests](../../../extensions/pi-editor-widgets/src/settings.test.ts).
