# Bounded code highlighting

[Shared TUI](../../README.md#usage)

Highlighting an unbounded file with Pi syntax highlighting risks slow renders. [`highlightCodeBounded`](index.ts) limits Pi syntax highlighting by total bytes, line count, and bytes per line, and `highlightCodeSelection` also marks selected ranges, such as search matches.

## Behaviour

- An explicit language overrides path detection.
- If no language applies or the input exceeds a limit, the text comes back unchanged.
- Generated ANSI does not count toward the limits.
- Limits that are not nonnegative safe integers throw a `RangeError`.

`highlightCodeSelection(source, options)` sanitises the source, applies the limits, and then applies `mark(text)` to each selected range:

- It returns `{ text, hasSelection }`, where `hasSelection` is true when at least one range marks visible text.
- Marks still apply when the input exceeds highlighting limits.
- Marks never split escape sequences or graphemes.
- A selection of only invisible characters never marks its neighbours.

## Usage

```ts
import {
  highlightCodeBounded,
  highlightCodeSelection
} from "@pi-mono/libs/tui/components/code-highlight";

const limits = { maxBytes: 256 * 1024, maxLines: 10_000, maxLineBytes: 4096 };

const highlighted = highlightCodeBounded(displaySafeSource, { ...limits, path });
const { text, hasSelection } = highlightCodeSelection(source, {
  ...limits,
  path,
  ranges: [{ line: 0, start: 4, end: 9 }],
  mark: markMatch
});
```

## Caller responsibilities

- Retain original source separately for exact copying or restoration.
- Pass display-safe text to `highlightCodeBounded`, because it does not sanitise terminal controls.
- Pass unsanitised source to `highlightCodeSelection`.
- Supply ordered, nonoverlapping ranges with a zero-based `line` index and UTF-16 offsets within that line. `start` is inclusive and `end` is exclusive.
- Make `mark` preserve text and restore the caller's background after selection styling.
- Choose the language and limits before rendering; see the [validated options](index.ts).

Related: [terminal text](../../terminal-text/README.md) sanitises the text that `highlightCodeBounded` receives.
