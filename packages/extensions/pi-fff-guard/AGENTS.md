# [pi-fff-guard](README.md) development

## Code navigation

- **Tool interception and diagnostics:** [src/index.ts](src/index.ts) and [src/interception.test.ts](src/interception.test.ts). Package provenance and tool-name classification are shared in [fff-tools.ts](../../utils/src/fff-tools.ts).
- **Inspection policy:** [src/evaluate-search.ts](src/evaluate-search.ts) validates arguments, enforces deadlines, and decides whether to allow or block a call.
- **Search scopes and missing paths:** [src/targets.ts](src/targets.ts).
- **Git protocol and symbolic links:** shared [Git ignore inspection](../../libs/src/git-ignore/README.md), with real-repository and worktree coverage in [src/git-ignore.test.ts](src/git-ignore.test.ts).

## Constraints

Keep notification delivery in the entry point. Use local glob matching for search filters and Git for ignore rules. Evaluate ignore status afresh for each call without enumerating ignored directories. Block with `{ block: true, reason }` without `terminate`.

Treat explicit paths as data. Limit diagnostics to the existing retry-tool hint; do not generate replacement commands. When changing adapters, check the installed schemas and normalization.

## Validation

Use [package validation](README.md#validation). Do not make paid model requests for validation.
