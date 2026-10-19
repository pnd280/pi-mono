# Collection browser keys and direct construction

[Collection browser](../src/tui/components/browser/README.md) · [Shared TUI](../src/tui/README.md)

This guide is for callers who remap browser keys, debug input precedence, or construct `Browser` without the [browser host](../src/tui/open-browser/README.md). The [browser README](../src/tui/components/browser/README.md) has the contracts that every caller needs.

## Keys

Configured actions take precedence over the fixed keys below, in this order: `copy`, `cancel`, `confirm`, `up`, `down`, `pageUp`, `pageDown`. The [browser controls](../src/tui/components/browser/controls.ts) map them to Pi keybindings.

| Fixed key                 | Action                                      |
| ------------------------- | ------------------------------------------- |
| **Tab**                   | Next section                                |
| **Shift+Tab**             | Previous section                            |
| **Ctrl+P**                | Preview, when the caller supplies `preview` |
| **Delete**, pressed twice | Remove                                      |
| **Alt+Enter**             | Alternate action                            |

### Input routing

- The [browser host](../src/tui/open-browser/README.md) routes resolved browser actions ahead of transcript controls while the inline browser has focus.
- A key already bound to a higher-priority action does not trigger a lower-priority action.
- The browser ignores key release events.
- The browser component installs no listeners.

### Edge cases

- Inspection mode needs `preview`. It uses a one-based item index and permits copying, scrolling, and closure, not selection actions.
- Below 40 columns or 10 rows, only cancellation is available.

## Direct construction

The [browser host](../src/tui/open-browser/README.md) does these steps for you. When you construct `Browser` directly:

1. Await `browser.activate()` to load the initial section.
2. Call `browser.invalidate()` on presentation transitions. This cancels armed deletion without closing the logical browser or aborting preparation.
3. Call `browser.dispose()` at final closure, not during remounts.
