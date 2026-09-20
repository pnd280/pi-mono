# @pi-mono/utils

Pure workspace helpers; callers supply clocks, state, and policy. See the [manifest](package.json) for imports and Pi peers.

## Usage

| Task                                     | Entry point                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| Classify FFF provenance and names        | [`@pi-mono/utils/fff-tools`](src/fff-tools.ts)               |
| Compare lexical paths                    | [`@pi-mono/utils/paths`](src/paths.ts)                       |
| Validate and slice source selections     | [`@pi-mono/utils/source-selection`](src/source-selection.ts) |
| Parse unified patches                    | [`@pi-mono/utils/patch`](src/patch.ts)                       |
| Preserve generated omission ranges       | [`@pi-mono/utils/output-text`](src/output-text.ts)           |
| Clip UTF-8 text at code-point boundaries | [`@pi-mono/utils/utf8`](src/utf8.ts)                         |
| Format compact ages                      | [`@pi-mono/utils/relative-time`](src/relative-time.ts)       |
| Normalize and rank text matches          | [`@pi-mono/utils/text-search`](src/text-search.ts)           |

For terminal text sanitization and shortcut normalization, use [terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md).

### FFF tools

Classifies package provenance and names only; callers validate schemas and choose display/blocking policy.

### Paths

Paths are lexical: no symlink resolution or filesystem checks.

- `containsPath(parent, child)` includes equality. Both paths must be absolute; relative inputs throw `TypeError`.
- `expandHomePath(value, home)` expands `~` and `~/`, plus `~\` on Windows. The supplied home path must be absolute.
- `relativeDisplayPath(value, cwd)` uses paths relative to `cwd` for descendants, `.` for `cwd` itself, and absolute paths otherwise. It uses forward slashes in the result. `cwd` must be absolute.

Use `absolutePathSchema` to enforce the same absolute-path requirement in other Zod schemas. These helpers do not interpret tool prefixes, file URLs, or glob syntax.

### Source selections

`selectionSchema` validates absolute, 1-based file lines and Unicode code point columns. Coordinates must be positive safe integers.

- `startLine` is required.
- `startColumn` defaults to 1.
- `endLine` defaults to `startLine`.
- `endColumn` is exclusive. Omit it to select through the final line's end.

The schema rejects unknown fields and reversed or empty explicit ranges.

Pass parsed selections to `selectSource(lines, firstLine, selection)`, where `firstLine` is the absolute line of `lines[0]`. Results clip to the window and line lengths, using zero-based window indexes; `partial` flags selected lines outside the window. Returned `before`/`text` preserve source, including tabs and controls; sanitize only for display.

### Output text

`splitOutputText` separates source from generated omissions by recorded UTF-16 ranges, rejecting unordered, overlapping, or out-of-bounds ranges. Rejoining reproduces original text, including source resembling notices. Consumers style and sanitize for display.

For stream retention or file previews, use [bounded stream output](../libs/src/output-buffer/README.md) or [bounded file output](../libs/src/bounded-output/README.md).

### Patches

`parsePatch(source, maxBytes)` accepts one unified patch, with or without file headers. It returns `undefined` for invalid or oversized patches and throws `RangeError` for an invalid byte limit. Pass the parsed result to the [diff renderer](../libs/src/tui/components/diff-view/README.md).

### Text search

Pass `normalizeSearch` text and a `prepareSearchQuery` query to `rankText(normalized, query)`. Its generator returns the rank or `undefined` for no match, yielding checkpoints during long literal/fuzzy scans. Callers schedule and cancel.

Use [cooperative search](../libs/src/text-search/README.md) for event-loop scheduling and cancellation.

## Configuration

Options are passed in code; no configuration files or environment variables.

## Side effects

Helpers do not read clocks, perform I/O, or persist state.

## Validation

Use the [focused commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
