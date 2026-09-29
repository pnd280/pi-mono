# [pi-nested-instructions](README.md) development

## Code navigation

- [src/index.ts](src/index.ts): input observation, turn-boundary delivery, and lifecycle refresh.
- [src/notices.ts](src/notices.ts): public notice identifier, schema, creation, and decoding (`pi-nested-instructions/notices`). Rendering belongs to the [pi-tool-display adapter](../pi-tool-display/src/adapters/pi-nested-instructions/README.md).
- [src/scopes.ts](src/scopes.ts): native/FFF input adapters and lexical ancestor chains. Shared pattern semantics live in [search-scopes.ts](../../utils/src/search-scopes.ts).
- [src/bash.ts](src/bash.ts) and [src/shell-words.ts](src/shell-words.ts): conservative command and shell-word parsing. Each supported command's options and operand rules live in one `commands` spec entry.
- [src/storage.ts](src/storage.ts): Pi filename priority, readable regular-file selection, and revision metadata.
- [src/ledger.ts](src/ledger.ts): persisted read markers and projection visibility; [src/discovery.ts](src/discovery.ts): batch discovery and reload decisions through the ledger interface.
- [CONTEXT.md](CONTEXT.md): domain terms.
- [src/index.test.ts](src/index.test.ts): offline host ordering and real reload integration.

## Constraints

Keep inference input-only and collect all batch markers before reading instructions. A recognized instruction read writes metadata, never duplicate instruction content. Do not inspect result contents or success, enumerate glob matches, execute inference commands, replace tools, or modify Pi's native instruction loading.

Persist through public session APIs. Do not register entry/message renderers or import TUI components; keep notice presentation in `pi-tool-display`. Deduplicate against the canonical projection, including context edits, and tie markers to the exact originating call. Preserve Pi filename precedence and lexical cwd boundaries. Keep new adapters explicit and document their limits in the [README](README.md).

## Validation

Use [package validation](README.md#validation) and the [Pi compatibility checklist](docs/pi-compatibility.md). Shared scope changes also require utils and `pi-fff-guard` checks/tests. No paid model requests.
