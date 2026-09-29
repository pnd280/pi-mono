# [pi-fff-guard](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): interception; official FFF provenance is shared in [utils](../../utils/src/fff-tools.ts).
- [src/evaluate-search.ts](src/evaluate-search.ts) and [src/targets.ts](src/targets.ts): decisions and search scopes; [scope parsing](../../utils/README.md#search-scopes) and [Git ignore inspection](../../libs/src/git-ignore/README.md) are shared.

## Constraints

Match search globs locally and ignore rules through Git. Recheck ignore status per call without enumerating ignored directories. Block with `{ block: true, reason }`, never `terminate`.

Treat explicit paths as data. Keep diagnostics to retry-tool hints, without replacement commands. Check installed schemas and normalization when changing adapters.

## Validation

Use [package validation](README.md#validation). For Pi/FFF upgrades or retirement, use the [compatibility checklist](docs/pi-compatibility.md).
