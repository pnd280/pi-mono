# Discovery design and sources

[Package](../README.md)

## Source behavior

Based on OpenCode v2 at [`39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49`](https://github.com/anomalyco/opencode/tree/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49):

- [Read-tool discovery](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/tool/plugin/read.ts) walks nested ancestors to the workspace boundary.
- [Session instructions](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/packages/core/src/session/instructions.ts) records synthetic instruction messages and deduplicates against surviving context.
- [v2 instructions documentation](https://github.com/anomalyco/opencode/blob/39e1ce55bccb4ab1761c1edee7a5bfbefe6c1a49/services/www/src/docs/content/instructions.mdx) distinguishes ambient instructions from nested snapshots.

Pi 0.87.1 is the host reference. Pi's startup loading, filename priority, broad-to-narrow ordering, and explicit reload behavior take precedence. OpenCode's ambient watcher and startup search are not ported.

FFF adapters reference [pi-fff source](https://github.com/dmtrKovalenko/fff/tree/89c19270ea2dfc20829a7429f72022571558093e/packages/pi-fff/src) at `89c19270ea2dfc20829a7429f72022571558093e`. Source schemas, rather than abbreviated README parameters, define the inputs.

## Input discovery

Discovery infers scope from native `read`, `ls`, `grep`, `find`, and `bash` inputs and official FFF `fffind`, `ffgrep`, and `fff-multi-grep`, including their native overrides. Search content patterns, exclusions, fuzzy filenames, and cursor-only searches do not provide scope. Only rooted pattern prefixes and finite brace alternatives contribute directories; glob matches are never enumerated. A wildcard never counts as an exact instruction-file read.

Bash inference recognizes literal paths in `cd`, `ls`, `cat`, `head`, `tail`, `sed`, `awk`, `grep`, `rg`, `find`, and `fd`. Unknown options, dynamic shell expressions, scripts, and ambiguous cwd changes are not interpreted; filename-only modes do not count as content reads. It never executes commands. See [scope extraction](../src/scopes.ts) and [Bash inference](../src/bash.ts) for supported operands and options.

## Pi adaptation

Use the completed assistant message supplied at `turn_end` for issued tool inputs, not execution results. Infer the batch's scopes, persist direct-read markers, then discover remaining instructions. This makes discovery independent of validation failures and guard ordering, avoids sibling races, and requires no tool replacement, steering, or retry.

Direct-read markers contain a lexical path, filesystem revision, and the originating entry/call identity. They contain no instruction text. A fingerprint of the projected call prevents a context replacement from preserving stale suppression. Auto-loaded messages contain full selected instructions plus structured metadata and a content fingerprint. That fingerprint detects context replacements which retain source details but remove the actual instructions.

Markers are per file: reading `AGENTS.md` does not suppress a preferred `AGENTS.override.md`. Listing a filename is not a content read. Failed and blocked read attempts count; results are not inspected.

## Session lifetime

If compaction, branch navigation, or context edits remove a notice or its originating read call from model-visible context, a later qualifying call can discover the file again. Metadata-only markers do not add instruction content.

Refresh on startup, resume, and `/reload` uses only scopes still represented by canonical context. Unchanged direct-read revisions suppress content reads. A changed file, changed preferred candidate, or disappearance can produce an updated/removed notice. Normal invocations otherwise retain snapshots; compacted-away scopes are not eagerly restored.

## Shared scope extraction

The pure brace expansion, fixed-glob-prefix, filename-filter, and FFF path normalization helpers were extracted from `pi-fff-guard` to `@pi-mono/utils/search-scopes`. The guard retains its missing-path, intersection, exclusion, and Git policies. Nested discovery deliberately does not import another extension or adopt its blocking policy.
