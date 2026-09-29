# TUI glyphs

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/glyphs`](index.ts) supplies stable activity/status markers and box-drawing glyphs for shared and extension TUI. Tool cards and agent summaries use `TUI_GLYPHS.bullet` (`•`) when collapsed and `TUI_GLYPHS.expanded` (`▾`) when expanded.

## Caller responsibilities

Apply theme styling at render time; choose labels, colors, and status meanings locally.

## Validation

Use the [package validation commands](../../../README.md#validation).
