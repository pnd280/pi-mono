# Utility coverage

[Package](../README.md) · [Shared testing policy](../../../docs/agents/testing.md)

For maintainers: this package tests pure validation and transformation. Search ranking, scheduling, cancellation, filesystem access, and terminal rendering are tested in [libs](../../libs/docs/testing.md); see the [workspace ownership rules](../../../docs/agents/testing.md#ownership).

Unit coverage is limited to the Must not regress invariants below. The shell-quoting check exercises a real Bash process.

## Must not regress

- POSIX-shell argument quoting preserves empty strings, whitespace, Unicode, apostrophes, and shell metacharacters as literal arguments when callers supply NUL-free text and choose a POSIX shell.
- FFF classification requires official provenance and recognised names, not a matching tool name alone.
- Lexical path containment does not treat sibling prefixes as descendants.
- The selection schema rejects invalid coordinates and unknown fields.
- Output omission classification uses recorded ranges for generated notices rather than matching literal notice lookalikes.
- Output joining and slicing preserve source text and its omission ranges as UTF-16 offsets.
- Output helpers reject overlapping omission ranges.
- Patch parsing accepts only one unified patch within the caller's byte bound.
- Patch parsing rejects invalid hunk counts and unordered or overlapping ranges in either source version.
- UTF-8 window decoding drops incomplete characters at the declared clipped edge and replaces invalid interior bytes.
- UTF-8 window decoding counts discarded edge bytes rather than replacement-character expansion from invalid interior bytes.

## Contracts

- Paths are lexical and absolute where required.
- Home expansion uses the supplied home, not ambient state.
- Search-scope helpers expand bounded finite brace alternatives without filesystem enumeration.
- Search-scope helpers retain only fixed glob prefixes.
- Search-scope helpers preserve recursive FFF filename filters after anchor normalisation.
- Consumers own missing-target, exclusion, and discovery policy.
- FFF expression parsing preserves existing query paths with spaces, explicit path intent, directory intent, and negative terms.
- Content patterns and bare fuzzy words do not become scopes.
- Multi-search uses only its constraints.
- Source selections use absolute, 1-based lines and code-point columns with exclusive ends.
- Source selections clip to the supplied window without normalising raw source.
- Patch parsing preserves changed-line counts and missing-newline markers.
- Empty hunk ranges use insertion and deletion anchors.
- UTF-8 clipping returns complete code points.

## Not covered here

- Filesystem path resolution, Git inspection, wall-clock timers, and UI interactions.
- Zod's generic type machinery. Keep only the inputs that distinguish this package's schemas and bounds.
