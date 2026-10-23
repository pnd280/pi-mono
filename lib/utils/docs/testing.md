# Utility test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../docs/agents/testing.md#coverage)

This package tests pure validation and transformation. [Libs](../../libs/docs/testing.md) owns scheduling, cancellation, filesystem access, and terminal rendering; consumers own missing-target, exclusion, and discovery policy.

## Must not regress

- **Critical, integration:** POSIX-shell argument quoting keeps empty strings, whitespace, Unicode, apostrophes, and shell metacharacters as literal arguments in a real Bash process, when callers supply NUL-free text and choose a POSIX shell.
- **Critical, unit:** Lexical path containment does not treat sibling prefixes as descendants.
- **High, unit:** FFF classification requires official provenance and recognised names, not a matching tool name alone.
- **High, unit:** Model references split at the first slash, so model IDs keep their slashes.
- **High, unit:** Model references without a provider or model ID are rejected.
- **High, unit:** Output omission classification uses recorded ranges for generated notices, not literal lookalikes in source text.
- **High, unit:** Output joining and slicing preserve source text and its omission ranges as UTF-16 offsets.
- **High, unit:** Output joining and slicing reject overlapping omission ranges.
- **High, unit:** Patch parsing accepts only one unified patch within the caller's byte bound, and rejects invalid hunk counts and unordered or overlapping ranges in either source version.
- **High, unit:** Task-envelope parsing preserves the body exactly, including closing-tag lookalikes.
- **High, unit:** Task-envelope parsing rejects mismatched framing, task IDs, or states.
- **High, unit:** UTF-8 window decoding drops incomplete characters at the declared clipped edge, replaces invalid interior bytes, and counts discarded edge bytes rather than replacement-character expansion.

## Not tested

- Search-scope expansion, FFF expression parsing, and missing-newline markers are below the severity bar.
- Libs or consumers own filesystem path resolution, Git inspection, wall-clock timers, and UI interactions.
- Zod owns its generic type machinery.
