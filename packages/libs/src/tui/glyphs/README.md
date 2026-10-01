# TUI glyphs

[Shared TUI](../README.md#usage)

## Behaviour

Status markers and tree connectors must look the same across extensions. [`TUI_GLYPHS`](index.ts) supplies stable activity and status markers and box-drawing glyphs for shared and extension TUI. Tool cards and agent summaries use `bullet` (`•`) when collapsed and `expanded` (`▾`) when expanded.

## Caller responsibilities

- Apply theme styling at render time.
- Choose labels, colours, and status meanings locally.
