# Shared TUI

[Library index](../../README.md#usage)

## Usage

Extensions share terminal components and Pi mounting through separate entry points.

Import supported TUI entry points through `@pi-mono/libs/tui/*` (see the [package exports](../../package.json)). Keep domain policy and I/O in consumers; shared components own presentation and interaction, not persistence.

| Module                                                   | Responsibility                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Browser](components/browser/README.md)                  | Searchable sections, selection, previews, actions, and responsive layout |
| [Browser host](open-browser/README.md)                   | Mount a browser and apply effects after final closure                    |
| [Responsive custom UI](responsive-custom-ui/README.md)   | Preserve a logical component across inline and overlay remounts          |
| [Order settings](components/order-settings/README.md)    | Independent ordering drafts with save and cancel controls                |
| [Settings menu](components/settings-menu/README.md)      | Shared scoped settings frame, dirty state, feedback, and controls        |
| [Windowed list](components/windowed-list/README.md)      | Visible item window with caller-controlled selection                     |
| [Text preview](components/text-preview/README.md)        | Cached preview viewport and overflow borders                             |
| [Hint footer](components/hint-footer/README.md)          | Width-aware hints and feedback                                           |
| [Tree](components/tree/README.md)                        | Connectors for measured rows                                             |
| [Diff view](components/diff-view/README.md)              | Display of parsed patches                                                |
| [Code highlighting](components/code-highlight/README.md) | Bounded syntax highlighting                                              |
| [Text layout](text-layout/README.md)                     | Cooperative full-text wrapping                                           |
| [Text budgets](text-budget/README.md)                    | Synchronous wrapping and bounded excerpts                                |
| [Terminal text](terminal-text/README.md)                 | Display sanitisation and unsafe-control detection                        |
| [Glyphs](glyphs/README.md)                               | Shared activity markers and tree connector glyphs                        |
| [Token counts](token-count/README.md)                    | Footer-scale token count formatting                                      |
| [Durations](duration/README.md)                          | Measured duration formatting                                             |
| [Keybindings](keybindings/README.md)                     | Shortcut validation and canonicalisation                                 |

## Validation

Use the [package checks](../../README.md#validation). Tests cover only the listed [Must not regress invariants](../../docs/testing.md#must-not-regress); shared TUI behaviour is below the severity bar. For real-terminal appearance, use prompt manager's [presentation scenarios](../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting) and tool display's [host interaction checks](../../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
