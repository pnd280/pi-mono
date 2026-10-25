# TUI glyphs

[Shared TUI](../README.md#usage)

Status markers and tree connectors must look the same across extensions. [`TUI_GLYPHS`](index.ts) supplies stable activity and status markers and box-drawing glyphs for shared and extension TUI.

## Behaviour

| Glyph         | Key                      | Use                                                  |
| ------------- | ------------------------ | ---------------------------------------------------- |
| `•`           | `bullet`                 | Collapsed tool cards and agent summaries             |
| `▾`           | `expanded`               | Expanded tool cards and agent summaries              |
| `▸`           | `closed`                 | A collapsed section that opens on click              |
| `▴`           | `collapse`               | A control that folds content back up                 |
| `✓`, `✗`, `⊘` | `outcome`                | A finished operation: success, failure, or cancelled |
| `◌`           | `queued`                 | Work that has not started                            |
| `•`           | `taskStatus.in_progress` | Running tasks                                        |

[`TUI_GLYPHS`](index.ts) also holds the other task statuses and the tree connectors.

## Usage

```ts
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

const line = theme.fg("success", `${TUI_GLYPHS.outcome.success} Saved`);
```

## Caller responsibilities

- Apply theme styling at render time.
- Choose labels, colours, and status meanings locally.
