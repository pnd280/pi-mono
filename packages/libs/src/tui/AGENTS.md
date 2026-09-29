# [Shared TUI](README.md) development

## Code navigation

[Component and helper index](README.md#usage) · [Browser contracts](components/browser/types.ts) · [Host mounting](open-browser/index.ts) · [Priority input adapter](responsive-custom-ui/fullscreen-input.ts)

## Constraints

Keep domain policy and I/O in consumers; reusable components receive effect callbacks rather than importing extensions or host mounting. Prepare full text outside render/input loops and keep theme colors out of cached layout. Preserve logical views across host remounts; dispose only on final closure.

## Validation

Use [package validation](../../README.md#validation) and [workspace verification](../../../../docs/agents/verification.md). Browser interaction tests belong in `components/browser/`, editor snapshot ordering in `open-browser/`, and host presentation lifetime in `responsive-custom-ui/`.
