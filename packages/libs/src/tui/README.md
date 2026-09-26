# Shared TUI

[Library index](../../README.md#usage)

## Usage

Import TUI APIs through `@pi-mono/libs/tui/*`.

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
| [Terminal text](terminal-text/README.md)                 | Display sanitization and unsafe-control detection                        |
| [Glyphs](glyphs/README.md)                               | Shared activity markers and tree connector glyphs                        |
| [Keybindings](keybindings/README.md)                     | Shortcut validation and canonicalization                                 |

## Configuration

No configuration files. Callers supply data, formatting, actions, Pi theme/keybindings, and domain policy/effects; components own layout/interaction.

## Side effects

No component filesystem, clipboard, process, or network I/O. Search/previews may schedule async work; host adapters mount Pi UI and dispose on closure/cancellation.

## Validation

Use the [package checks](../../README.md#validation). Automated component and host-mounting tests live beside their implementations. For real-terminal appearance, use prompt manager's [presentation scenarios](../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting) and tool display's [host interaction checks](../../../extensions/pi-tool-display/docs/validation.md#host-interaction-checks).
