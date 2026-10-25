# Settings-file access

[Library index](../../README.md#usage)

Extensions that keep settings in JSON files such as Pi's `settings.json` must respect project trust and must save a change without losing other fields or other writers' changes. [`@pi-mono/libs/settings-file`](index.ts) reads and updates these files.

## Behaviour

- The global scope is `<agentDir>/settings.json` and the project scope is `<cwd>/.pi/settings.json`. Settings in parent directories never apply.
- Reads return current content without writes.
- Scoped reads and section loads read the project file only when `projectTrusted` is true.
- A section save makes one locked change: it replaces one field and keeps unrelated fields, other writers' changes, and existing mode bits.
- If another writer holds the lock, the save throws without retrying.
- Malformed JSON and invalid UTF-8 are refused, never repaired. Saves also refuse dangling links; `readSettingsRecord` and section loads treat them as missing files.
- Reads and serialised writes are limited to 1 MiB.

| When you…                                                          | Read                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Read a whole file or both scopes, or check what a read returns     | [Scopes](reads-and-saves.md#scopes) and [reads](reads-and-saves.md#reads) |
| Check section load warnings, save refusals, or error messages      | [Section loads and saves](reads-and-saves.md#section-loads-and-saves)     |
| Check lock order, symlink handling, or file creation during a save | [Locked updates](reads-and-saves.md#locked-updates)                       |

### Sections

[`settingsSection`](section.ts) loads and saves one field of a top-level settings section, such as `layout` in `ext.pi-editor-widgets`, in both scopes. `load()` returns `{ global, project, warnings }`: a missing or invalid value loads as `undefined`, and an invalid one adds a `loadWarning`. `save(scope, value)` refuses a project save in an untrusted project and a value that fails the schema, then runs one locked update that replaces only its field. The [section rules](reads-and-saves.md#section-loads-and-saves) list every case.

## Usage

```ts
import { settingsSection } from "@pi-mono/libs/settings-file";

const layout = settingsSection({
  cwd: ctx.cwd,
  projectTrusted: ctx.isProjectTrusted(),
  key: "ext.my-extension",
  field: "layout",
  schema: layoutSchema,
  invalidValue: "Cannot save this layout: too many or invalid entries.",
  loadWarning: (path) => `my-extension: cannot load layout settings from ${path}.`
});

const { global, project, warnings } = layout.load(); // never writes
layout.save("project", nextLayout); // throws when untrusted, invalid, or locked
```

## Caller responsibilities

- Pass `ctx.isProjectTrusted()` as `projectTrusted`. The read functions don't check trust, so open project settings with them only after you establish project trust.
- Use a top-level key that your feature owns, such as `ext.<package>`.
- For sections, give the schema the field's limits, and word `invalidValue` and `loadWarning` for your feature.
- For other reads, validate the parsed settings, and decide whether an invalid file is ignored or disables the feature. Show sanitised diagnostics specific to your feature, without exposing settings contents.

Related: [working-message ordering](../working-message/README.md#persistence), [editor-widget layouts](../../../extensions/pi-editor-widgets/README.md#configuration), and the `ext.<package>` settings of other extensions use the library.

## Validation

Use [package validation](../../README.md#validation) and check affected consumers. Edge cases are tested in the [transaction tests](transaction.test.ts) and [section tests](section.test.ts).
