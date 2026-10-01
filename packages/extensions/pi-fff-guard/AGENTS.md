# [pi-fff-guard](README.md) development

Block with `{ block: true, reason }`, never `terminate`.

## Code navigation

| Area                 | Files                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Interception         | [src/index.ts](src/index.ts). Official FFF provenance is shared in [utils](../../utils/src/fff-tools.ts).              |
| Decisions and scopes | [src/evaluate-search.ts](src/evaluate-search.ts) and [src/targets.ts](src/targets.ts).                                 |
| Shared helpers       | [Scope parsing](../../utils/README.md#search-scopes) and [Git ignore inspection](../../libs/src/git-ignore/README.md). |

## Constraints

- Treat explicit paths as data.
- Match search globs locally.
- Apply ignore rules through Git.
- Recheck ignore status on every call, without enumerating ignored directories.
- Limit diagnostics to hints about retrying with another tool; never suggest replacement commands.
- When changing adapters, check the installed schemas and normalisation.

## Validation

Use [package validation](README.md#validation). For Pi or FFF upgrades, or retirement, use the [compatibility checklist](docs/pi-compatibility.md).
