# [pi-fff-guard](README.md) development

Block with `{ block: true, reason }`, never `terminate`.

## Code navigation

| Area                  | Files                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interception          | [src/index.ts](src/index.ts). Official FFF provenance is shared in [utils](../../utils/src/fff-tools.ts).                                                                           |
| Decisions and scopes  | [src/evaluate-search.ts](src/evaluate-search.ts) makes every allow or block decision; [src/targets.ts](src/targets.ts) extracts scopes and matches globs.                           |
| Git ignore inspection | [src/git-ignore.ts](src/git-ignore.ts) reports status only. It follows the [Git ignore rules](docs/search-scopes.md#git-ignore-rules).                                              |
| Shared helpers        | [Scope parsing](../../utils/docs/caller-boundaries.md#search-scopes) owns prefixes and normalisation. The guard keeps its own missing-path, intersection, exclusion, and Git rules. |

## Constraints

- Treat explicit paths as data.
- Match search globs locally.
- Apply ignore rules through Git.
- Recheck ignore status on every call, without enumerating ignored directories.
- Limit diagnostics to hints about retrying with another tool. Never suggest replacement commands, and never show the internal `cause` of an `unavailable` inspection.
- When changing adapters, check the installed schemas and normalisation.

## Validation

For checks, test coverage, Pi or FFF upgrades, and retirement, start at [package validation](README.md#validation).
