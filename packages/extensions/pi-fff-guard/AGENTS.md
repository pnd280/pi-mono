# [pi-fff-guard](README.md) development

## Code navigation

- **Tool interception and diagnostics:** [src/index.ts](src/index.ts) and [src/interception.test.ts](src/interception.test.ts). Official FFF ownership/name classification is shared through [@pi-mono/utils/fff-tools](../../utils/README.md).
- **Inspection policy:** [src/evaluate-search.ts](src/evaluate-search.ts) owns argument validation, the deadline, and allow/block decisions without a Pi session. Keep UI notification delivery in the entry point. See the [workspace architecture](../../../docs/architecture.md#fff-guard).
- **Search scopes and missing paths:** [src/targets.ts](src/targets.ts). Local glob matching is for search filters only, never Git ignore rules.
- **Git ignore checks and symbolic links:** [src/git-ignore.ts](src/git-ignore.ts).

## Constraints

Do not enumerate ignored directories or cache ignore decisions across calls. Use `{ block: true, reason }` without `terminate`.

Do not generate replacement commands or add search guidance beyond the existing retry-tool hint. When changing adapters, check the installed schemas and normalization. Preserve explicit paths as data.

Do not make paid model requests for validation.
