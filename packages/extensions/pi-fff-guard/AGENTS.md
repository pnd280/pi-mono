# [pi-fff-guard](README.md) development

## Code navigation

- **Tool interception and diagnostics:** [src/index.ts](src/index.ts) and [src/interception.test.ts](src/interception.test.ts). Package provenance and tool-name classification are shared in [fff-tools.ts](../../utils/src/fff-tools.ts).
- **Inspection policy:** [src/evaluate-search.ts](src/evaluate-search.ts): argument validation, deadlines, and allow/block decisions.
- **Search scopes and missing paths:** [src/targets.ts](src/targets.ts).
- **Git protocol and symbolic links:** shared [Git ignore inspection](../../libs/src/git-ignore/README.md), with real-repository and worktree coverage in [src/git-ignore.test.ts](src/git-ignore.test.ts).

## Constraints

Notify from the entry point. Match search globs locally and ignore rules through Git. Recheck ignore status per call without enumerating ignored directories. Block with `{ block: true, reason }`, never `terminate`.

Treat explicit paths as data. Diagnostics may give the existing retry-tool hint, never replacement commands. Check installed schemas and normalization when changing adapters.

## Validation

Use [package validation](README.md#validation). Do not make paid model requests for validation.
