# TUI glyphs

[Shared TUI](../README.md#usage)

## Behavior

[`TUI_GLYPHS`](index.ts) supplies stable activity/status markers and box-drawing glyphs for shared and extension TUI. Tool cards and agent summaries use `bullet` (`•`) when collapsed and `expanded` (`▾`) when expanded.

## Caller responsibilities

Apply theme styling at render time; choose labels, colors, and status meanings locally.
