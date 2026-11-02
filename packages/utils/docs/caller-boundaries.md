# Utility caller boundaries

[@pi-mono/utils](../README.md)

## Patches

[`parsePatch`](../src/patch.ts) accepts one unified patch, with or without file headers, within a byte limit that the caller supplies. When present, file headers must be an adjacent `--- ` and `+++ ` pair. Invalid patches and patches over the limit return `undefined`; a limit that is not a nonnegative safe integer throws `RangeError`.

## Output text and UTF-8

[`splitOutputText`](../src/output-text.ts) distinguishes generated omissions by recorded UTF-16 ranges even when source resembles a notice. Preserve those ranges across transformations. Consumers style and sanitise for display. For stream retention, use [bounded stream output](../../libs/src/output-buffer/README.md).

[`decodeUtf8Window`](../src/utf8.ts) counts discarded source bytes in `omittedBytes`, not replacement characters for invalid interior bytes. At a clipped edge, it discards at most one incomplete character. `utf8Prefix` and `utf8Suffix` clip text to a byte limit at code-point boundaries, and throw `RangeError` for a limit that is not a nonnegative safe integer.

## Package provenance

[`registeredBy`](../src/provenance.ts) checks that a package registered a tool, from its npm source or entry-point path. [`fff-tools`](../src/fff-tools.ts) uses it for the official FFF package and classifies tool names. Neither checks tool schemas or applies policy.

## Search scopes

[`search-scopes`](../src/search-scopes.ts) derives static prefixes without enumerating files.

- `parseFffScopes` interprets verified FFF path fields, filename queries, and multi-search constraints. It returns positive expressions and negative query terms.
- Each expression keeps its path-field or query origin in `source`, so nested-instruction discovery can ignore recursive filename path fields before it expands patterns.
- Like FFF, `normalizeFffPath` gives absolute path fields `/` separators, so Windows paths classify as paths and globs. Relative values keep their separators.
- `alternatives` expands comma-separated brace groups and throws `Error` above 64 alternatives or a fixed nesting limit. `globRoot` returns the static prefix before the first glob segment, or `undefined` when the expression has no glob or starts with one.

Callers have these duties:

- Supply whether the full filename query names an existing path, so that paths that contain spaces stay intact.
- Own input validation, existing-path detection and error handling, scope limits beyond brace expansion, filesystem checks, exclusion application, intersections, and blocking policy.

Consumers choose their own failure handling. pi-fff-guard passes unexpected access failures from scope extraction to its decision layer, which allows the search with a diagnostic. Nested discovery can keep lexical hints.

## Paths

[`paths`](../src/paths.ts) works lexically, without symlink resolution or filesystem checks. `containsPath` requires two absolute paths, `relativeDisplayPath` an absolute working directory, and `expandHomePath` an absolute home directory; each throws `TypeError` otherwise. These helpers do not interpret tool prefixes, file URLs, or glob syntax.

`windowsDrivePath` converts Pi's Git Bash, MSYS, Cygwin, and WSL drive aliases, such as `/c/dir`, `/mnt/c/dir`, and `/cygdrive/c/dir`, to `C:\dir` on any platform. Callers decide when to apply it; Pi applies it only on Windows.

## Shell quoting

[`quotePosixShellArgument`](../src/shell.ts) quotes text as one literal argument for a POSIX shell. Callers supply NUL-free text and must not use the result for `cmd.exe` or PowerShell.

## Model references

[`modelReferenceSchema`](../src/model-reference.ts) trims and validates a `provider/model-id` setting; the model ID may contain slashes. `splitModelReference` splits a valid reference at its first slash and throws `TypeError` otherwise. Callers own registry lookup, availability errors, and thinking-level support.

## Task envelopes

[`formatTaskEnvelope`](../src/task-envelope.ts) writes the model-facing text of a subagent task result. It escapes the task ID and summary and preserves the body unchanged. Callers own summary and body limits.

Supply the expected task ID and state to `parseTaskEnvelope` from validated result details, not from the text. The parser returns the unchanged body when the envelope framing and expected values match, or `undefined` when they do not. Edits within an otherwise valid body or escaped summary are accepted.

`formatJobEnvelope` and `parseJobEnvelope` apply the same rules to background job results, with a `<job>` frame. Supply the expected job ID, state, outcome, and exit code from validated job details. An active job has no outcome, and a `null` exit code has no attribute. A `failed` or `cancelled` outcome frames the body as `<job_error>`, and the other outcomes as `<job_result>`.
