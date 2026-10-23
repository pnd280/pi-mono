# Text budgets

[Shared TUI](../README.md#usage)

## Behaviour

Use [`text-budget`](index.ts) to wrap text synchronously and produce excerpts within row and character budgets.

- `wrapRows` wraps ANSI-styled text and clamps wide graphemes that cannot fit.
- `wrapHangingRows` wraps a first row beside a marker at one width and the remaining text at another, so continuation rows can take a tree prefix. It consumes each break once and retains explicit blank rows.
- `compactRows` retains head and tail rows, reserving one budgeted row for the caller's omission notice.
- `displayLine` normalises raw text into one compact line from a bounded prefix (2048 UTF-16 code units by default), appending `…` only when it clips.
- `compactText` wraps text into at most `maxRows` rows. Text longer than `maxCharacters` UTF-16 code units is cut to excerpts from the start and end before wrapping. If `maxRows` is 1, only the notice remains, and the end excerpt needs at least three rows.

Wrapping and suffix excerpts use Pi's SGR tracking. Its [styling limits](../terminal-text/README.md#behaviour) apply to continuation rows and reconstructed suffix styling.

`notice` receives omitted-row counts after full wrapping, or `undefined` when character clipping skips measurement. See [budget options](index.ts) for limits.

## Caller responsibilities

- Supply normalised text with only SGR styling, except to `displayLine`, which normalises its input. Use [terminal text utilities](../terminal-text/README.md) to normalise raw terminal output.
- Own width, budgets, notices, styling, and exact source retention.
- Pass measured rows to `compactRows`.
- Reserve tree connector width before measurement.
- Use [text preview layout](../components/text-preview/README.md#behaviour) to wrap complete text cooperatively.

Related: [tree](../components/tree/README.md) owns connector placement, and [diff view](../components/diff-view/README.md) owns patch selection.

## Usage

Reserve the indentation and two connector columns before measuring normalised content:

```ts
import { renderTree } from "@pi-mono/libs/tui/components/tree";
import { compactText } from "@pi-mono/libs/tui/text-budget";

const rows = compactText(displaySafeText, {
  width: 76,
  maxRows: 5,
  maxCharacters: 16 * 1024,
  notice: (count) => (count === undefined ? "… more output" : `… ${count} more rows`)
});
const tree = renderTree([{ rows }], { width: 80, indent: 2 });
```
