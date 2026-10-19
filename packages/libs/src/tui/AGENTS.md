# [Shared TUI](README.md) development

Reusable components receive effect callbacks rather than importing extensions or host mounting, as the [ownership rule](README.md#usage) requires.

## Code navigation

| When you…                               | Read                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pick a component or helper              | [Component and helper index](README.md#usage)                                                                                  |
| Change browser options or actions       | [Browser contracts](components/browser/types.ts)                                                                               |
| Change mounting or post-closure effects | [Host mounting](open-browser/index.ts)                                                                                         |
| Change focused-input routing            | [Priority input adapter](responsive-custom-ui/fullscreen-input.ts) and its [host contract](../../docs/tui-fullscreen-input.md) |

## Constraints

- Prepare full text outside render and input loops.
- Keep theme colours out of cached layout.
- Preserve logical views across host remounts.
- Dispose logical views only on final closure.

## Validation

Use [package validation](../../README.md#validation) and [workspace verification](../../../../docs/agents/verification.md). If a TUI invariant is approved, put browser interaction tests in `components/browser/`, editor snapshot ordering in `open-browser/`, and host presentation lifetime in `responsive-custom-ui/`.
