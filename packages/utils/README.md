# @pi-mono/utils

Pure helpers shared by workspace packages. Callers supply clocks, state, and feature policy. The [manifest](package.json) defines supported imports and Pi peer dependencies.

## Usage

| Task                                     | Entry point                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| Classify FFF provenance and names        | [`@pi-mono/utils/fff-tools`](src/fff-tools.ts)         |
| Compare lexical paths                    | [`@pi-mono/utils/paths`](src/paths.ts)                 |
| Parse unified patches                    | [`@pi-mono/utils/patch`](src/patch.ts)                 |
| Preserve generated omission ranges       | [`@pi-mono/utils/output-text`](src/output-text.ts)     |
| Clip UTF-8 text at code-point boundaries | [`@pi-mono/utils/utf8`](src/utf8.ts)                   |
| Format compact ages                      | [`@pi-mono/utils/relative-time`](src/relative-time.ts) |
| Normalize and rank text matches          | [`@pi-mono/utils/text-search`](src/text-search.ts)     |

For terminal text sanitization and shortcut normalization, use [terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md).

### FFF tools

FFF classification checks package provenance and tool names only. Callers must validate schemas and apply their own display or blocking policy.

### Paths

Path helpers compare and format paths lexically, without resolving symlinks or checking filesystem access:

- `containsPath(parent, child)` includes equality. Both paths must be absolute; relative inputs throw `TypeError`.
- `expandHomePath(value, home)` expands `~` and `~/`, plus `~\` on Windows. The supplied home path must be absolute.
- `relativeDisplayPath(value, cwd)` uses paths relative to `cwd` for descendants, `.` for `cwd` itself, and absolute paths otherwise. It uses forward slashes in the result. `cwd` must be absolute.

Use `absolutePathSchema` to enforce the same absolute-path requirement in other Zod schemas. These helpers do not interpret tool prefixes, file URLs, or glob syntax.

### Output text

Use `splitOutputText` to partition source and generated omission fragments using recorded UTF-16 ranges. It rejects unordered, overlapping, or out-of-bounds ranges. Joining the fragments reproduces the original text, including source text that resembles omission notices. Consumers choose styling and sanitize fragments for display.

For stream retention or file previews, use [bounded stream output](../libs/src/output-buffer/README.md) or [bounded file output](../libs/src/bounded-output/README.md).

### Patches

`parsePatch(source, maxBytes)` accepts one unified patch, with or without file headers. It returns `undefined` for invalid or oversized patches and throws `RangeError` for an invalid byte limit. Pass the parsed result to the [diff renderer](../libs/src/tui/components/diff-view/README.md).

### Text search

Pass text from `normalizeSearch` and a query from `prepareSearchQuery` to `rankText(normalized, query)`. It returns a generator whose completion value is the match rank, or `undefined` when there is no match. It yields checkpoints during long literal and fuzzy scans. Callers control scheduling and cancellation.

Use [cooperative search](../libs/src/text-search/README.md) for event-loop scheduling and cancellation.

## Configuration

There are no configuration files or environment variables. Callers pass helper options in code.

## Side effects

Helpers do not read clocks, perform I/O, or persist state.

## Validation

Use the [focused commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
