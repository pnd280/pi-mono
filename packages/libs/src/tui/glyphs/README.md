# TUI glyphs

[Shared TUI](../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/glyphs`](index.ts) provides stable activity markers, task-status markers, and box-drawing glyphs for shared and extension-owned TUI renderers.

## Caller responsibilities

Apply theme styling at the rendering boundary. Keep labels, colors, and other domain-specific feedback semantics in the consumer that owns their meaning.

## Validation

Use the [package validation commands](../../../README.md#validation).
