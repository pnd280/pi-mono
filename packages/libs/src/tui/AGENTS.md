# [Shared TUI](README.md) development

## Code navigation

| When you…                               | Read                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pick a component or helper              | [Component and helper index](README.md#usage)                                                                                  |
| Change browser options or actions       | [Browser contracts](components/browser/types.ts)                                                                               |
| Change mounting or post-closure effects | [Host mounting](open-browser/index.ts)                                                                                         |
| Change focused-input routing            | [Priority input adapter](responsive-custom-ui/fullscreen-input.ts) and its [host contract](../../docs/tui-fullscreen-input.md) |
| Check browser or mounting coverage      | [Shared TUI validation](README.md#validation)                                                                                  |

## Constraints

- Prepare full text outside render and input loops.
- Keep theme colours out of cached layout.
- Preserve logical views across host remounts, and dispose them only on final closure.

## Validation

Place the tests for a newly approved TUI invariant by concern: browser interaction in `components/browser/`, editor snapshot ordering in `open-browser/`, and host presentation lifetime in `responsive-custom-ui/`.
