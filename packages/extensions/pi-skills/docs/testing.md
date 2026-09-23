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

No skill-file discovery/content loading, native undo/persistence/queue implementation, or fuzzy-scoring matrix. Those are delegated to Pi. Avoid repeating host tests across modes or token positions when the extension follows the same path; token edge cases belong in the pure suite.
