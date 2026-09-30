# Nested instruction coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Select Pi's first readable regular instruction file per directory, with BOM handling, fallback on read errors, broad-to-narrow ordering, and cwd/ancestor exclusion. Preserve requested lexical scope across symlinks.
- Infer native, selective-read-compatible, FFF standalone/override, multi-grep, and conservative Bash scopes from inputs only. Content patterns, exclusions, fuzzy words, scripts, output destinations, and result text cannot create unrelated scopes. Only stdin redirection marks a read; optional-argument options and empty attached long-option values cannot consume path operands. Directory listings do not mark content read.
- Preserve Bash command boundaries, cwd-sensitive logical and pipeline ordering, literal quoted or escaped metacharacters, unquoted finite braces, and leading stdin redirects. Redirect-only commands must still stop inference at `||`.
- Reject the entire Bash invocation on parser errors or [unsupported syntax](design.md#bash-inference), even after inference stops at a logical branch or ambiguous cwd change. Validate lazy word parts in ignored arguments, brace contents, and redirect destinations. Dynamic expressions and unsupported quoting combinations cannot create literal paths.
- Batch public nested execution-start inputs with direct calls at `turn_end`, including blocked/invalid children. Hidden child output never suppresses instruction delivery or creates read markers; a direct sibling read still can. Child results and parent source code are not discovery inputs. Clear pending inputs across turns and sessions.
- Record exact direct instruction-file reads as contentless metadata, including partial/failed/blocked attempts. No extra content I/O is permitted for those paths. Gather all direct markers before batch discovery; lower-priority markers do not suppress preferred files.
- Deduplicate through actual session projections. Context replacements, omissions, compaction, and branching cannot leave stale suppression. Markers require their originating call; malformed persisted data is ignored.
- Ordinary accesses retain snapshots. Reload detects changed selections, changed content, and removals without repeating unchanged notices or eagerly restoring compacted scopes. Unchanged direct-read revisions require no content read.
- The offline host must execute sibling calls without steering, leave native cwd instructions intact, and persist discoveries after results but before the next provider request. Real host reload must retain deduplication and publish changed content.
- Discovery registers no custom renderer. Notices retain complete model-facing content and validated metadata regardless of whether a display extension is loaded.

## Coverage boundaries

This extension owns adapter policy, instruction selection, metadata lifetime, delivery ordering, and refresh semantics. Bash tests cover the restricted unbash-to-inference boundary, not the upstream parser's full grammar. [Utils](../../../utils/docs/testing.md) own finite brace expansion and static-prefix/FFF normalization. Existing guard tests protect its consumer policy after extraction.

Use disposable filesystem fixtures and the installed `SessionManager` for projection behavior. Host checks use Pi's faux provider with network access disabled. The [pi-tool-display adapter](../../pi-tool-display/src/adapters/pi-nested-instructions/README.md) owns rendering, expansion, layout, and mouse-routing checks.

## Exclusions

No upstream FFF search/index correctness, arbitrary shell evaluation, or real provider calls. Wildcards do not prove which instruction file a tool read. Metadata revisions do not establish byte equality for direct reads; this is intentionally input-only. Transient message filtering by other extensions or final provider-payload rewrites are outside the canonical session projection and are not tracked.
