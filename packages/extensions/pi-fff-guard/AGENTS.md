# [pi-fff-guard](README.md) development

## Code navigation

- **Tool interception and diagnostics:** [src/index.ts](src/index.ts) and [src/interception.test.ts](src/interception.test.ts). Package provenance and tool-name classification are shared in [fff-tools.ts](../../utils/src/fff-tools.ts).
- **Inspection policy:** [src/evaluate-search.ts](src/evaluate-search.ts) and [src/evaluate-search.test.ts](src/evaluate-search.test.ts): allow/block decisions and diagnostics.
- **Search scopes and missing paths:** [src/targets.ts](src/targets.ts). Pure brace expansion, fixed prefixes, and FFF path normalization are shared in [search-scopes.ts](../../utils/src/search-scopes.ts).
- **Git protocol and symbolic links:** shared [Git ignore inspection](../../libs/src/git-ignore/README.md), with real-repository and worktree coverage in the [shared Git suite](../../libs/src/git-ignore/index.test.ts). [src/git-ignore.test.ts](src/git-ignore.test.ts) covers consumer fixture isolation.

## Constraints

Match search globs locally and ignore rules through Git. Recheck ignore status per call without enumerating ignored directories. Block with `{ block: true, reason }`, never `terminate`.

Treat explicit paths as data. Keep diagnostics to retry-tool hints, without replacement commands. Check installed schemas and normalization when changing adapters.

## Validation

Pi upgrades: [compatibility checklist](docs/pi-compatibility.md).

Use [package validation](README.md#validation). Do not make paid model requests for validation.
