# Utility coverage

[Package](../README.md) · [Shared testing policy](../../../docs/agents/testing.md)

For maintainers: this package tests pure validation and transformation. Search ranking, scheduling, cancellation, filesystem access, and terminal rendering are tested in [libs](../../libs/docs/testing.md); see the [workspace ownership rules](../../../docs/agents/testing.md#ownership).

## Contracts

- Paths are lexical and absolute where required. Sibling prefixes are not descendants. Home expansion uses the supplied home, not ambient state.
- POSIX-shell argument quoting preserves empty strings, whitespace, Unicode, apostrophes, and shell metacharacters as literal arguments. Callers supply NUL-free text and choose the shell.
- FFF classification requires official provenance and recognised names, not a matching tool name alone.
- Search-scope helpers expand bounded finite brace alternatives without filesystem enumeration. They retain only fixed glob prefixes, and preserve recursive FFF filename filters after anchor normalisation. Consumers own missing-target, exclusion, and discovery policy.
- FFF expression parsing preserves existing query paths with spaces, explicit path intent, directory intent, and negative terms. Content patterns and bare fuzzy words do not become scopes; multi-search uses only its constraints.
- Source selections use absolute, 1-based lines and code-point columns with exclusive ends. They clip to the supplied window and preserve raw source. Reject invalid coordinates and unknown fields.
- Output omission ranges identify generated notices only. Joining and slicing preserve source, UTF-16 offsets, and literal notice lookalikes. Reject overlapping ranges.
- Patch parsing accepts one bounded unified patch. It validates counts and ordered, nonoverlapping ranges in both source versions, and preserves changed-line counts and missing-newline markers. Empty hunk ranges use insertion and deletion anchors.
- UTF-8 clipping returns complete code points. Decoding distinguishes clipped edges from invalid interior bytes, and reports discarded source bytes without counting replacement-character expansion.

## Not covered here

- Filesystem path resolution, Git inspection, wall-clock timers, and UI interactions.
- Zod's generic type machinery. Keep only the inputs that distinguish this package's schemas and bounds.
