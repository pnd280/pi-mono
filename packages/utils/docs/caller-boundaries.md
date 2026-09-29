# Utility caller boundaries

[@pi-mono/utils](../README.md)

Read the relevant section when integrating a helper; exported source and colocated tests define exact inputs and results. The [manifest](../package.json) lists supported imports.

## Search scopes

[`search-scopes`](../src/search-scopes.ts) derives static prefixes without enumerating files. Callers own existing-path detection, filesystem checks, exclusions, intersections, and blocking policy. [`fff-tools`](../src/fff-tools.ts) classifies provenance and names only, not tool schemas or policy.

## Paths and shell arguments

[`paths`](../src/paths.ts) works lexically, without symlink resolution or filesystem checks. Supply absolute paths where required; these helpers do not interpret tool prefixes, file URLs, or glob syntax.

[`quotePosixShellArgument`](../src/shell.ts) quotes one NUL-free POSIX-shell argument, not whole commands or Windows shell syntax.

## Source selections

[`selectionSchema`](../src/source-selection.ts) uses 1-based file lines and Unicode code point columns; end columns are exclusive, and omission selects through the final line's end. Pass parsed selections to `selectSource` with the line number of the first supplied line. Returned text preserves tabs and controls; sanitize only for display.

## Output text and UTF-8

[`splitOutputText`](../src/output-text.ts) distinguishes generated omissions by recorded UTF-16 ranges even when source resembles a notice. Preserve those ranges across transformations; consumers style and sanitize for display. For stream retention or file previews, use [bounded stream output](../../libs/src/output-buffer/README.md) or [bounded file output](../../libs/src/bounded-output/README.md).

[`decodeUtf8Window`](../src/utf8.ts) counts discarded source bytes in `omittedBytes`, not replacement characters for invalid interior bytes. UTF-8 clipping preserves code-point boundaries.

## Patches and search

[`parsePatch`](../src/patch.ts) accepts one unified patch, with or without file headers; invalid or oversized patches return `undefined`. Pass parsed results to the [diff renderer](../../libs/src/tui/components/diff-view/README.md).

[`rankText`](../src/text-search.ts) consumes normalized text and a prepared query. Callers schedule and cancel its checkpoint-yielding generator. Use [cooperative search](../../libs/src/text-search/README.md) when event-loop scheduling and cancellation are needed.
