# [Shared TUI](README.md) development

Keep domain policy and I/O in consumers; reusable components receive effect callbacks rather than importing extensions or host mounting.

## Code navigation

| When you …                              | Read                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| Pick a component or helper              | [Component and helper index](README.md#usage)                      |
| Change browser options or actions       | [Browser contracts](components/browser/types.ts)                   |
| Change mounting or post-closure effects | [Host mounting](open-browser/index.ts)                             |
| Change focused-input routing            | [Priority input adapter](responsive-custom-ui/fullscreen-input.ts) |

## Constraints

- Prepare full text outside render and input loops.
- Keep theme colours out of cached layout.
- Preserve logical views across host remounts; dispose only on final closure.

## Validation

Use [package validation](../../README.md#validation) and [workspace verification](../../../../docs/agents/verification.md). If a TUI invariant is approved, put browser interaction tests in `components/browser/`, editor snapshot ordering in `open-browser/`, and host presentation lifetime in `responsive-custom-ui/`.
