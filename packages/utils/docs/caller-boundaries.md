# Utility caller boundaries

[@pi-mono/utils](../README.md)

## Patches

[`parsePatch`](../src/patch.ts) accepts one unified patch, with or without file headers, within a byte limit that the caller supplies. When present, file headers must be an adjacent `--- ` and `+++ ` pair. Invalid patches and patches over the limit return `undefined`; a limit that is not a nonnegative safe integer throws `RangeError`.

## Output text and UTF-8

[`splitOutputText`](../src/output-text.ts) distinguishes generated omissions by recorded UTF-16 ranges even when source resembles a notice. Preserve those ranges across transformations. Consumers style and sanitise for display. For stream retention, use [bounded stream output](../../libs/src/output-buffer/README.md).

[`decodeUtf8Window`](../src/utf8.ts) counts discarded source bytes in `omittedBytes`, not replacement characters for invalid interior bytes. At a clipped edge, it discards at most one incomplete character. `utf8Prefix` and `utf8Suffix` clip text to a byte limit at code-point boundaries, and throw `RangeError` for a limit that is not a nonnegative safe integer.

## Package provenance

[`registeredBy`](../src/provenance.ts) checks that a package registered a tool, from its npm source or entry-point path. It does not check tool schemas or apply policy.

## Search scopes

[`search-scopes`](../src/search-scopes.ts) derives static prefixes without enumerating files.

`alternatives` expands comma-separated brace groups and throws `Error` above 64 alternatives or a fixed nesting limit. `globRoot` returns the static prefix before the first glob segment, or `undefined` when the expression has no glob or starts with one.

Callers own input validation, error handling, scope limits beyond brace expansion, and filesystem checks.

Consumers choose their own failure handling. Nested discovery can keep lexical hints.

## Paths

[`paths`](../src/paths.ts) works lexically, without symlink resolution or filesystem checks. `containsPath` requires two absolute paths, `relativeDisplayPath` an absolute working directory, and `expandHomePath` an absolute home directory; each throws `TypeError` otherwise. These helpers do not interpret tool prefixes, file URLs, or glob syntax.

`windowsDrivePath` converts Pi's Git Bash, MSYS, Cygwin, and WSL drive aliases, such as `/c/dir`, `/mnt/c/dir`, and `/cygdrive/c/dir`, to `C:\dir` on any platform. Callers decide when to apply it; Pi applies it only on Windows.

## Shell quoting

[`quotePosixShellArgument`](../src/shell.ts) quotes text as one literal argument for a POSIX shell. Callers supply NUL-free text and must not use the result for `cmd.exe` or PowerShell.

## Model references

[`modelReferenceSchema`](../src/model-reference.ts) trims and validates a `provider/model-id` setting; the model ID may contain slashes. `splitModelReference` splits a valid reference at its first slash and throws `TypeError` otherwise. Callers own registry lookup, availability errors, and thinking-level support.

## Skill references

[`expandSkillReferences`](../src/skill-reference.ts) replaces each whitespace-separated token that the caller's `resolve` function maps to a registered `/skill:<name>` command with the `formatSkillReference` output for that command. `skillReferenceCatalog` projects Pi's registered commands onto skill paths and prompt-template names.

- Complete references that are already in the format, with the registered path, stay unchanged. The longest candidate is checked first. When the format ends in a placeholder, a reference must be followed by whitespace or the end of the text.
- A leading reference that starts a registered skill command, up to a literal space, or a registered prompt-template name, up to any whitespace, gets one leading space. Pi's native skill insertion and prompt-template expansion then leave it literal. A leading command that isn't a reference stays unchanged.

[`skillReferenceFormatSchema`](../src/skill-reference.ts) validates an `expansionFormat` setting: at most 512 Unicode code points, with a `{path}` placeholder. Use it for every format that you pass to these helpers.

Callers own token matching, the settings section and its loading, and any check that skips the call.

## Task envelopes

[`formatTaskEnvelope`](../src/task-envelope.ts) writes the model-facing text of a subagent task result. It escapes the task ID and summary and preserves the body unchanged. Callers own summary and body limits.

Supply the expected task ID and state to `parseTaskEnvelope` from validated result details, not from the text. The parser returns the unchanged body when the envelope framing and expected values match, or `undefined` when they do not. Edits within an otherwise valid body or escaped summary are accepted.

`formatJobEnvelope` and `parseJobEnvelope` apply the same rules to background job results, with a `<job>` frame. Supply the expected job ID, state, outcome, and exit code from validated job details. An active job has no outcome, and a `null` exit code has no attribute. A `failed` or `cancelled` outcome frames the body as `<job_error>`, and the other outcomes as `<job_result>`.
