# Discovery design and sources

[Package](../README.md) · [Glossary](../GLOSSARY.md)

## Source behaviour

Based on OpenCode v2 at [`39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49`](https://github.com/anomalyco/opencode/tree/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49):

- [Read-tool discovery](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/tool/plugin/read.ts) walks nested ancestors to the workspace boundary.
- [Session instructions](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/session/instructions.ts) records synthetic instruction messages and deduplicates against surviving context.
- [v2 instructions documentation](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/services/www/src/docs/content/instructions.mdx) distinguishes ambient instructions from nested snapshots.

Pi 1.3.0 is the host reference. Pi's startup loading, filename priority, broad-to-narrow ordering, and explicit reload behaviour take precedence. OpenCode's ambient watcher and startup search are not ported.

FFF adapters reference [pi-fff source](https://github.com/dmtrKovalenko/fff/tree/89c19270ea2dfc20829a7429f72022571558093e/packages/pi-fff/src) at `89c19270ea2dfc20829a7429f72022571558093e`. Source schemas, rather than abbreviated README parameters, define the inputs.

## Input discovery

Discovery infers scope from native `read`, `ls`, `grep`, `find`, and `bash` inputs and official FFF `fffind`, `ffgrep`, and `fff-multi-grep`, including their native overrides. Search content patterns, exclusions, fuzzy filenames, and cursor-only searches do not provide scope. Only rooted pattern prefixes and finite brace alternatives contribute directories. Glob matches are never enumerated. A wildcard never counts as an exact instruction-file read.

### Bash inference

[Bash inference](../src/bash.ts) consumes the [unbash](https://github.com/webpro-nl/unbash) AST without executing commands or expanding variables or filesystem globs. Supported syntax includes literal simple commands, unquoted finite brace alternatives, ordinary pipes, `&&` and `||` chains, sequential commands, and basic redirections (`<`, `>`, `>>`, `<&`, `>&`).

Parser errors or unsupported syntax discard inference for the entire invocation, including otherwise valid commands. Unsupported syntax includes dynamic expansions (also in declaration assignments such as `export NAME=value`), command-prefix assignments, compound commands, background execution, `|&`, `time`, negation, extended globs, ANSI-C or localized strings, here-documents, here-strings, and variable file descriptors.

On Windows, Pi's Bash can be Git Bash, MSYS2, Cygwin, or WSL. Path operands and path-valued options, with separate or attached values, that start with a drive component such as `/c/` are read as the drive path `C:/`, as in Git Bash and MSYS2. Other POSIX-rooted paths, such as `/tmp/pkg`, give no scope, because their mount root depends on the shell. A `cd` to such a path stops inference for the rest of the invocation.

Quoting and escapes determine whether tildes and glob characters are literal. Scope patterns cannot retain per-character shell quoting, so two combinations also discard the invocation's scope: quotes or escapes inside brace alternatives, and words mixing literal glob characters with active glob or brace syntax. Entirely quoted or escaped literal paths remain supported, as do quoted plain prefixes such as `"pkg/"{src,lib}/AGENTS.md`.

Inference recognises paths in `cd`, `ls`, `cat`, `head`, `tail`, `sed`, `awk`, `grep`, `rg`, `find`, and `fd`. Unknown options discard that command's hints. Embedded scripts and ambiguous cwd changes are not interpreted. Inference stops before the right-hand side of `||`, including when its left-hand side is a redirect-only command. Later syntax is still validated. Filename-only modes do not count as content reads. For `find`, only path operands before the filter expression provide scope. See [scope extraction](../src/scopes.ts) and the Bash implementation for supported operands and options.

## Pi adaptation

Never inspect execution results. Each batch is handled at `turn_end`:

1. Take direct tool inputs from the completed assistant message supplied at `turn_end`.
2. Add nested inputs collected from public `tool_execution_start` events carrying `parentToolCallId`, including blocked or invalid attempts.
3. Infer the batch's scopes and save all direct-read markers.
4. Discover the remaining instructions.

Pending inputs are cleared at turn and session boundaries. Handling the whole batch at once avoids races between sibling calls, and needs no tool replacement, steering, or retry.

Nested calls contribute scope but never direct-read suppression: codemode or another parent can filter their output before the model sees it. A direct sibling read can still suppress the matching file for the whole batch. Unknown nested tool schemas and opaque parent code provide no scope unless a supported child input is observed.

Direct-read markers contain a lexical path, filesystem revision, and the identity of the entry and call that created it. They contain no instruction text. A fingerprint of the projected call prevents a context replacement from preserving stale suppression. Notices contain the full selected instructions plus structured metadata and a `messageDigest` of the entire model-facing message, including the note and tag around the instructions. The `messageDigest` detects context replacements which retain source details but change the delivered text.

Markers are per file: reading `AGENTS.md` does not suppress a preferred `AGENTS.override.md`. Listing a filename is not a content read. Failed and blocked read attempts count; results are not inspected.

## Session lifetime

Discovery and refresh query the [ledger](../GLOSSARY.md#delivery), never raw session entries; notices encode and decode their own details.

The ledger accepts a notice only when its complete projected message matches `messageDigest`. It privately retains the selected path and the body decoded from that visible message, using the persisted display spelling rather than the current cwd. Refresh compares the newly selected path and instruction body directly with that snapshot, including empty content and exact whitespace. Notice metadata contains neither a filesystem revision nor a separate body fingerprint.

If compaction, branch navigation, or context edits remove a notice or its originating read call from model-visible context, a later qualifying call can discover the file again. Metadata-only markers do not add instruction content.

Refresh on startup, resume, and `/reload` uses only scopes still represented by canonical context. Unchanged direct-read revisions suppress content reads. A changed file, changed preferred candidate, or disappearance can produce an updated or removed notice. A direct read of a missing or unreadable file delivered nothing: if a file appears there later, refresh loads it, and if none appears, refresh adds no removal notice. Normal invocations otherwise retain snapshots; compacted-away scopes are not eagerly restored.

Older notice formats do not represent scopes under the [version-3 persisted contract](pi-compatibility.md#persisted-notice-contract); their message text remains in the session.

## Shared scope extraction

[Shared scope helpers](../../../utils/README.md#search-scopes) own brace expansion, fixed glob prefixes, filename filters, and FFF expression parsing. Discovery supplies existing-query-path facts and retains lexical hints after access failures. It ignores negative terms and keeps its own direct-read policy; it does not adopt `pi-fff-guard`'s blocking, missing-path, intersection, exclusion, or Git policies.
