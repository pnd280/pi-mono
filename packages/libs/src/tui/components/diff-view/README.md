# Diff view

[Shared TUI](../../README.md#usage)

Showing a patch inside Pi needs rows that fit the terminal and respect expansion budgets. [`renderDiffPanel`](index.ts) renders parsed patches as a full-width panel of terminal rows.

## Behaviour

- The panel shows a split view when the patch has both additions and removals and the width allows it. Otherwise it shows a unified view.
- Replacements align within change blocks, never across context or hunk separators.
- The panel sanitises text before highlighting.
- Compact budgets count changed rows, not context or structural markers. Expansion includes all supplied hunks.
- Patches remain unmodified.
- Every row is exactly the supplied width.

For padding, theme colours, and the strips that show header rows, hunk numbers, and footer rows, see the [diff panel layout guide](../../../../docs/tui-diff-view.md).

## Usage

```ts
import { highlightCodeBounded } from "@pi-mono/libs/tui/components/code-highlight";
import { renderDiffPanel } from "@pi-mono/libs/tui/components/diff-view";
import { parsePatch } from "@pi-mono/utils/patch";

const parsed = parsePatch(patchText, maxPatchBytes);
const rows =
  parsed === undefined
    ? [theme.fg("muted", "Diff unavailable")]
    : renderDiffPanel(parsed, {
        width,
        expanded,
        compactRows: 30,
        contextRows: 2,
        expansionHint,
        theme,
        highlight: (source) => highlightCodeBounded(source, { ...limits, path }),
        header: totals,
        footer: notes
      });
```

## Caller responsibilities

- Pass the `ParsedPatch` from `parsePatch(source, maxBytes)` to `renderDiffPanel`.
- Choose the source byte limit before parsing.
- Handle an `undefined` parse result as an unavailable patch.
- Supply the width, expansion state, an expansion hint, a [`DiffViewTheme`](index.ts), and trusted syntax highlighting.
- Choose valid [row budgets](index.ts) before rendering, because invalid budgets throw a `RangeError`.
- Own labels, totals, empty and unavailable messages, outcomes, expansion keys, loading, and retention.
- Pass totals and notes as styled header and footer rows.

Related: [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts) owns patch parsing and patch types.
