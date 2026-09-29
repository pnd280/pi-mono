# [pi-nested-instructions](README.md) development

## Code navigation

- [src/index.ts](src/index.ts) and [src/discovery.ts](src/discovery.ts): batch delivery and refresh; [src/ledger.ts](src/ledger.ts): projection visibility and markers.
- [src/scopes.ts](src/scopes.ts), [src/bash.ts](src/bash.ts), and [src/storage.ts](src/storage.ts): input inference and instruction selection. Shared pattern semantics live in [utils](../../utils/README.md#search-scopes).
- [src/notices.ts](src/notices.ts): public `pi-nested-instructions/notices` contract; rendering belongs to [pi-tool-display](../pi-tool-display/src/adapters/pi-nested-instructions/README.md).
- [CONTEXT.md](CONTEXT.md): domain terms; [design](docs/design.md): discovery and session lifetime.

## Constraints

Keep inference input-only and collect all batch markers before reading instructions. Do not inspect results, enumerate glob matches, execute inference commands, replace tools, or modify Pi's native instruction loading.

Persist through public session APIs; keep rendering in `pi-tool-display`. Deduplicate against the canonical projection, including context edits, and tie markers to the exact originating call. Preserve Pi filename precedence and lexical cwd boundaries. Document new adapter limits in [input discovery](docs/design.md#input-discovery).

## Validation

Use [package validation](README.md#validation). For Pi upgrades, use the [compatibility checklist](docs/pi-compatibility.md); for shared scope changes, check utils and `pi-fff-guard` too.
