# Utility caller boundaries

[@pi-mono/utils](../README.md)

## Search scopes

[`search-scopes`](../src/search-scopes.ts) derives static prefixes without enumerating files. `parseFffScopes` interprets verified FFF path fields, filename queries, and multi-search constraints, returning positive expressions and negative query terms. Expressions retain their path-field or query origin: discovery ignores recursive filename path fields before expanding patterns. Supply whether the full filename query names an existing path so paths containing spaces remain intact.

Callers own input validation, existing-path detection and error handling, scope limits, filesystem checks, exclusion application, intersections, and blocking policy. The guard propagates unexpected access failures; nested discovery can retain lexical hints. [`fff-tools`](../src/fff-tools.ts) classifies provenance and names only, not tool schemas or policy.

## Paths

[`paths`](../src/paths.ts) works lexically, without symlink resolution or filesystem checks. Supply absolute paths where required; these helpers do not interpret tool prefixes, file URLs, or glob syntax.

## Shell arguments

[`quotePosixShellArgument`](../src/shell.ts) quotes one NUL-free POSIX-shell argument, not whole commands or Windows shell syntax.

## Source selections

[`selectionSchema`](../src/source-selection.ts) uses 1-based file lines and Unicode code point columns. End columns are exclusive, and omission selects through the final line's end. Pass parsed selections to `selectSource` with the line number of the first supplied line. Returned text preserves tabs and controls; sanitise only for display.

## Output text and UTF-8

[`splitOutputText`](../src/output-text.ts) distinguishes generated omissions by recorded UTF-16 ranges even when source resembles a notice. Preserve those ranges across transformations. Consumers style and sanitise for display. For stream retention or file previews, use [bounded stream output](../../libs/src/output-buffer/README.md) or [bounded file output](../../libs/src/bounded-output/README.md).

[`decodeUtf8Window`](../src/utf8.ts) counts discarded source bytes in `omittedBytes`, not replacement characters for invalid interior bytes. UTF-8 clipping preserves code-point boundaries.

## Task envelopes

[`formatTaskEnvelope`](../src/task-envelope.ts) writes the model-facing text of a subagent task result. It escapes the task ID and summary and preserves the body unchanged. Callers own summary and body limits.

Supply the expected task ID and state to `parseTaskEnvelope` from validated result details, not from the text. The parser returns the unchanged body when the envelope framing and expected values match, or `undefined` when they do not. Edits within an otherwise valid body or escaped summary are accepted.

`formatJobEnvelope` and `parseJobEnvelope` apply the same rules to background job results, with a `<job>` frame. Supply the expected job ID, state, outcome, and exit code from validated job details. An active job has no outcome, and a `null` exit code has no attribute. A `failed` or `cancelled` outcome frames the body as `<job_error>`, and the other outcomes as `<job_result>`.

## Patches

[`parsePatch`](../src/patch.ts) accepts one unified patch, with or without file headers. Invalid or oversized patches return `undefined`. Pass parsed results to the [diff renderer](../../libs/src/tui/components/diff-view/README.md).
