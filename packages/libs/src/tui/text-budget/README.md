# Text budgets

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-budget`](index.ts) wraps text synchronously and produces bounded excerpts.

- `wrapRows` wraps ANSI-styled text and clamps wide graphemes that cannot fit.
- `compactRows` retains head and tail rows, reserving one budgeted row for the caller's omission notice.
- `textPrefix` clips a UTF-16 prefix without cutting a grapheme or SGR sequence.
- `compactText` limits text passed to wrapping, preserving head/tail excerpts and SGR state.

For `compactText`, `maxCharacters` must be a safe integer ≥2 UTF-16 units, otherwise `RangeError`. `notice` receives omitted-row counts after full wrapping, or `undefined` when character clipping skips measurement.

## Caller responsibilities

Supply normalized text with only SGR styling. Use [terminal text utilities](../terminal-text/README.md) to normalize raw terminal output.

Own width, budgets, notices, styling, and exact source retention. `compactRows` needs measured rows; reserve tree connector width before measurement.

Use [text layout](../text-layout/README.md) to wrap complete text cooperatively. Connector placement belongs to [tree](../components/tree/README.md), and patch selection belongs to [diff view](../components/diff-view/README.md).

## Usage

Reserve the indentation and two connector columns before measuring normalized content:

```ts
import { compactText } from "@pi-mono/libs/tui/text-budget";
import { renderTree } from "@pi-mono/libs/tui/components/tree";

const rows = compactText(displaySafeText, {
  width: 76,
  maxRows: 5,
  maxCharacters: 16 * 1024,
  notice: (count) => (count === undefined ? "… more output" : `… ${count} more rows`)
});
const tree = renderTree([{ rows }], { width: 80, indent: 2 });
```

## Validation

Use the [package validation commands](../../../README.md#validation).
