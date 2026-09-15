# Text budgets

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/text-budget`](index.ts) wraps text synchronously and produces bounded excerpts.

- `wrapRows` wraps ANSI-styled text and clamps each row to the available width, including viewports narrower than a wide grapheme.
- `compactRows` retains head and tail rows, reserving one budgeted row for the caller's omission notice.
- `textPrefix` clips a UTF-16 prefix without cutting a grapheme or SGR sequence.
- `compactText` limits the text passed to wrapping, preserves head and tail excerpts with their SGR state, and applies the row budget.

`compactText` requires `maxCharacters` to be a safe integer of at least two, measured in UTF-16 code units. Invalid values throw `RangeError`. The `notice` callback receives the omitted-row count when the full text was wrapped, or `undefined` when character clipping skipped that measurement.

## Caller responsibilities

Supply normalized text with only SGR styling. Raw terminal-output normalization belongs to [terminal text utilities](../terminal-text/index.ts).

Callers choose width, row and character budgets, notice wording, and styling. Source collection and retention remain outside this module. `compactRows` expects already measured rows. Tree callers reserve the connector width before measuring content.

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
