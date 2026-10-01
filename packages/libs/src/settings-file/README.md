# Settings-file access

[@pi-mono/libs](../../README.md)

Reads and updates JSON settings files such as Pi's `settings.json`. Used by [working-message ordering](../working-message/README.md#persistence) and [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration).

## Behaviour

Reads return current content without changing the file. Updates apply one locked change.

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

- Existing settings symlinks are followed, not replaced.
- Unrelated fields and existing mode bits are kept.
- Malformed JSON and dangling links are refused, never repaired.
- Parent directories can be created. New files use mode `0600`, subject to the platform.

### Limits

Reads and serialised writes are limited to 1 MiB.

## Caller responsibilities

- Validate the parsed settings section, and decide whether an invalid file is ignored or disables the feature.
- Access project settings only after establishing project trust. These helpers don't enforce scope or trust.
- Mutators own their section's schema, and decide whether invalid preferences can be replaced.
- Show sanitised read and write diagnostics specific to your feature, without exposing settings contents.

## Validation

Use [package validation](../../README.md#validation) and check affected consumers. Edge cases are tested in the [reader tests](index.test.ts), [transaction tests](transaction.test.ts), [working-message settings tests](../working-message/settings.test.ts), and [widget settings tests](../../../extensions/pi-editor-widgets/src/settings.test.ts).
