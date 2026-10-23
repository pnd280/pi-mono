# Shared TUI

[Library index](../../README.md#usage)

## Usage

Extensions that build terminal views need the same presentation and interaction code, such as browsers, settings menus, and text budgets. Import the supported TUI entry points through `@pi-mono/libs/tui/*` (see the [package exports](../../package.json)). Keep domain policy and I/O in consumers. Shared components own presentation and interaction, not persistence.

| Module                                                   | Responsibility                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Browser](components/browser/README.md)                  | Searchable sections, selection, previews, actions, and responsive layout |
| [Browser layout](components/browser/layout.ts)           | Inline or overlay sizing, importable without loading the browser         |
| [Browser host](open-browser/README.md)                   | Mount a browser and apply effects after final closure                    |
| [Responsive custom UI](responsive-custom-ui/README.md)   | Preserve a logical component across inline and overlay remounts          |
| [Settings menu](components/settings-menu/README.md)      | Shared scoped settings frame, dirty state, feedback, and controls        |
| [Text preview](components/text-preview/README.md)        | Cached preview viewport and overflow borders                             |
| [Hint footer](components/hint-footer/README.md)          | Width-aware hints and feedback                                           |
| [Tree](components/tree/README.md)                        | Connectors for measured rows                                             |
| [Diff view](components/diff-view/README.md)              | Display of parsed patches                                                |
| [Code highlighting](components/code-highlight/README.md) | Bounded syntax highlighting                                              |
| [Text budgets](text-budget/README.md)                    | Synchronous wrapping and bounded excerpts                                |
| [Terminal text](terminal-text/README.md)                 | Display sanitisation and unsafe-control detection                        |
| [Glyphs](glyphs/README.md)                               | Shared activity markers and tree connector glyphs                        |
| [Token counts](token-count/README.md)                    | Footer-scale token count formatting                                      |
| [Durations](duration/README.md)                          | Measured duration formatting                                             |
| [Keybindings](keybindings/README.md)                     | Shortcut validation and canonicalisation                                 |

## Validation

Use [package checks](../../README.md#validation). Layout, colours, glyphs, and convenience behaviour are below the automated-test severity bar; check them manually.

Tests in `open-browser/` and `responsive-custom-ui/` cover the [focused-input invariant](../../docs/testing.md#must-not-regress) through the real offline Pi host. These tests cover single delivery, remapped controls, focus changes, stale callbacks, remounts, abort, unrelated overlays, and effects after final closure.

| When you…                                                           | Read                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change terminal-text sanitisation or bounded highlighting           | [Must not regress invariants](../../docs/testing.md#must-not-regress)                                                                                                                                                                                                        |
| Change mounting, fullscreen input routing, or presentation lifetime | e2e tests in `open-browser/` and `responsive-custom-ui/`, and the [interactive host fixture](../validation/interactive-host/README.md)                                                                                                                                       |
| Check real-terminal appearance                                      | Prompt manager's [presentation scenarios](../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting) and tool display's [host interaction checks](../../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks) |
