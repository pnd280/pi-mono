# Utility coverage

[Package](../README.md) · [Shared testing policy](../../../docs/agents/testing.md)

## Contracts

- Paths are lexical and absolute where required; sibling prefixes are not descendants. Home expansion uses the supplied home, not ambient state.
- POSIX-shell argument quoting preserves empty strings, whitespace, Unicode, apostrophes, and shell metacharacters as literal arguments. Callers supply NUL-free text and choose the shell.
- FFF classification requires official provenance and recognized names, not a matching tool name alone.
- Source selections use absolute, 1-based lines and code-point columns with exclusive ends, clip to the supplied window, and preserve raw source. Reject invalid coordinates and unknown fields.
- Output omission ranges identify generated notices only; joining and slicing preserve source, UTF-16 offsets, and literal notice lookalikes. Reject overlapping ranges.
- Patch parsing accepts one bounded unified patch, validates counts and ordered, nonoverlapping ranges in both source versions, and preserves changed-line counts and missing-newline markers. Empty hunk ranges use insertion/deletion anchors.
- UTF-8 clipping returns complete code points; decoding distinguishes clipped edges from invalid interior bytes and reports discarded source bytes without counting replacement-character expansion.
- Relative ages distinguish future/unknown timestamps and unit boundaries.
- Search ranks phrases, all literal terms, then Pi-compatible fuzzy matches. Scans preserve matches across chunks and yield checkpoints during expensive work.

## Coverage boundaries

This package owns pure validation, transformation, and ranking. [Libraries](../../libs/docs/testing.md) own scheduling, cancellation, filesystem access, and terminal rendering. Consumers own their budgets, admission policy, and wiring.

## Exclusions

No filesystem path resolution, Git inspection, wall-clock timers, or UI interactions belong here. Do not duplicate Zod's generic type machinery; retain inputs that distinguish this package's schemas and bounds. Keep differential checks against Pi to detect drift in the locally implemented fuzzy scoring algorithm; this is not unchanged delegation.
