# Skill-reference coverage

[Package](../README.md) · [Shared testing policy](../../../../docs/agents/testing.md)

## Contracts

- Expand exact whitespace-delimited registered commands using verbatim paths and configured formats; preserve unmatched text and avoid rescanning inserted or previously expanded references, including overlapping reference prefixes.
- Formats from the trusted current project override global formats; invalid formats/files fall back safely. Reload refreshes configuration and registered resources.
- Keep leading references literal rather than triggering native skill-body injection, including custom formats beginning with a command. Expansion remains enabled when native completion is disabled.
- Preserve native autocomplete ordering and metadata, exclude command names shared with other sources, and identify owned completion items by object identity without claiming borrowed items.
- Replace the whole token around the cursor, preserve surrounding separators/lines, and position the cursor after the inserted space. Delegate unrelated completion unchanged and discard aborted asynchronous results.
- Enter acceptance in the real editor must not submit; single-candidate and later-line Tab must reach skill completion rather than file completion. TUI registration is separate from non-TUI input expansion.

## Coverage boundaries

This package owns token/configuration policy and provider composition. Keep focused real-host wiring and real-editor routing tests: provider-only assertions cannot prove native acceptance behavior. [Libraries](../../../libs/docs/testing.md) own bounded settings reads and fixture isolation.

## Exclusions

Do not test skill-file discovery/content loading, native undo/persistence/queue implementation, or a fuzzy-scoring matrix; Pi owns those. Avoid repeating host tests across modes or token positions when the extension follows the same path; token edge cases belong in the pure suite.

## Terminal checks

For completion, format, or host integration changes, launch an isolated offline Pi session from the repository root:

```sh
vpr 'pi-skills#validate:terminal'
```

The launcher provides `review` and `release` skills and `sample.txt`. Submissions appear in `work/inputs.jsonl` under the printed fixture directory, without model requests. The fixture is retained after exit.

1. Complete `Use /skill:re` and a later line beginning `/skill:re` with Tab. Place the cursor after `re` in `/skill:reBAD rest`; accept and confirm the suffix is replaced while `rest` remains. Enter and Tab must accept without submission; Escape cancels, and undo removes an insertion.
2. Toggle skill commands in `/settings`: completion follows the setting, but submitted `/skill:review` still expands without skill-body injection.
3. For format changes, set `"ext.pi-skills": {"expansionFormat": "{command} ({path})"}` in the printed fixture's `agent/settings.json`, then `/reload` and submit `/skill:review`. Check the new format and no injected skill content.
4. For resource/lifecycle changes, rename `skills/review.md` to `skills/fresh.md`, change its frontmatter `name` to `fresh`, and `/reload`. Check completion and the submitted path.
5. For provider composition changes, check file (`./sam`), attachment (`@sam`), native command (`/settings`), and fixture extension (`/fixture`, `#fi`) completion outside skill contexts.
