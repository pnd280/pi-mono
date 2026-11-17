# Diff view

[Presentation](../../../docs/presentation.md#diff-viewer)

Showing a patch inside Pi needs rows that fit the terminal and respect expansion budgets. [`renderDiffPanel`](index.ts) renders parsed patches as a full-width panel of terminal rows.

## Behaviour

- The panel shows a split view when the patch has both additions and removals and the width allows it. Otherwise it shows a unified view.
- Replacements align within change blocks, never across context or hunk separators.
- The panel sanitises text before highlighting.
- Compact budgets count changed rows, not context or structural markers. Expansion includes all supplied hunks.
- Patches remain unmodified.
- Every row is exactly the supplied width.

For padding, theme colours, and the strips that show header rows, hunk numbers, and footer rows, see the [diff viewer layout](../../../docs/presentation.md#layout).

## Usage

```ts
import { highlightCodeBounded } from "@pi-mono/libs/tui/components/code-highlight";
import { parsePatch } from "@pi-mono/utils/patch";

import { renderDiffPanel } from "./diff-view/index.ts";

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

- Supply trusted syntax highlighting.
- Own labels, totals, empty and unavailable messages, outcomes, expansion keys, loading, and retention.
- Pass totals and notes as styled header and footer rows.

Related: [`@pi-mono/utils/patch`](../../../../../utils/src/patch.ts) owns patch parsing and patch types.
