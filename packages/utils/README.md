# @pi-mono/utils

Pure workspace helpers; callers supply clocks, state, and policy. See the [manifest](package.json) for imports and Pi peers.

## Usage

| Task                                     | Entry point                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| Classify FFF provenance and names        | [`@pi-mono/utils/fff-tools`](src/fff-tools.ts)               |
| Infer static search-pattern prefixes     | [`@pi-mono/utils/search-scopes`](src/search-scopes.ts)       |
| Compare lexical paths                    | [`@pi-mono/utils/paths`](src/paths.ts)                       |
| Quote POSIX-shell arguments              | [`@pi-mono/utils/shell`](src/shell.ts)                       |
| Validate and slice source selections     | [`@pi-mono/utils/source-selection`](src/source-selection.ts) |
| Parse unified patches                    | [`@pi-mono/utils/patch`](src/patch.ts)                       |
| Preserve generated omission ranges       | [`@pi-mono/utils/output-text`](src/output-text.ts)           |
| Clip UTF-8 text at code-point boundaries | [`@pi-mono/utils/utf8`](src/utf8.ts)                         |
| Format compact ages                      | [`@pi-mono/utils/relative-time`](src/relative-time.ts)       |
| Normalize and rank text matches          | [`@pi-mono/utils/text-search`](src/text-search.ts)           |

For terminal text sanitization and shortcut normalization, use [terminal text](../libs/src/tui/terminal-text/README.md) and [keybindings](../libs/src/tui/keybindings/README.md).

### Search scopes

[`search-scopes`](src/search-scopes.ts) derives static prefixes; brace alternatives are finite and capped at 64, without enumerating files. Existing-path detection, filesystem checks, exclusions, intersections, and blocking policy belong to callers. [`fff-tools`](src/fff-tools.ts) classifies provenance/names only, not tool schemas or policy.

### Paths

[`paths`](src/paths.ts) works lexically, without symlink resolution or filesystem checks. Supply absolute paths where required; these helpers do not interpret tool prefixes, file URLs, or glob syntax.

### Shell arguments

[`quotePosixShellArgument`](src/shell.ts) quotes one NUL-free POSIX-shell argument, not whole commands or Windows shell syntax.

### Source selections

[`selectionSchema`](src/source-selection.ts) validates 1-based file lines and Unicode code point columns; end columns are exclusive, and omission selects through the final line's end. Pass parsed selections to `selectSource` with the line number of the first supplied line. Returned text preserves tabs and controls; sanitize only for display.

### Output text

[`splitOutputText`](src/output-text.ts) separates source from generated omissions by recorded UTF-16 ranges, even when source resembles a notice. Preserve those ranges across transformations; consumers style and sanitize for display.

For stream retention or file previews, use [bounded stream output](../libs/src/output-buffer/README.md) or [bounded file output](../libs/src/bounded-output/README.md).

### Patches

[`parsePatch`](src/patch.ts) accepts one unified patch, with or without file headers; invalid or oversized patches return `undefined`. Pass parsed results to the [diff renderer](../libs/src/tui/components/diff-view/README.md).

### Text search

[`rankText`](src/text-search.ts) consumes normalized text and a prepared query. Callers schedule and cancel its checkpoint-yielding generator.

Use [cooperative search](../libs/src/text-search/README.md) for event-loop scheduling and cancellation.

### UTF-8

[`utf8Prefix`, `utf8Suffix`, and `decodeUtf8Window`](src/utf8.ts) clip at code-point boundaries. `omittedBytes` counts discarded source bytes, not replacement characters for invalid interior bytes.

## Configuration

Options are passed in code; no configuration files or environment variables.

## Side effects

Helpers do not read clocks, perform I/O, or persist state.

## Validation

[Coverage specification](docs/testing.md).

Use the [focused commands](../../docs/development.md#focused-validation) with `@pi-mono/utils`.
