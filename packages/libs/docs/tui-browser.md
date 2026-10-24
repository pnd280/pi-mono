# Collection browser interaction details

[Collection browser](../src/tui/components/browser/README.md) · [Shared TUI](../src/tui/README.md)

This guide is for callers who tune search and action timing, remap browser keys, debug input precedence, or construct `Browser` without the [browser host](../src/tui/open-browser/README.md). The [browser README](../src/tui/components/browser/README.md) has the contracts that every caller needs.

## Searches and pending actions

- After a query edit, the previous results stay visible while the search is pending.
- If that search takes longer than 200 ms, a loading message replaces the results and their action hints.
- Other searches show the loading message at once.
- While a search is pending, only query editing, section switching, and cancellation are available.
- While a removal or selection action is pending, only cancellation is allowed.

## Details and preview

- `details` show below the results for the selected item.
- Details fill the rows that the results do not use. The results keep at least half of the rows, or all their rows if they need fewer. `…` marks detail rows that do not fit.
- The browser wraps `details` synchronously.
- `preview` opens a separate scrollable view. Without it, **Ctrl+P** does not open a preview and has no preview hint.

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

- In fullscreen mode, the [browser host](../src/tui/open-browser/README.md) routes resolved browser actions ahead of transcript controls while the inline browser has focus.
- A key already bound to a higher-priority action does not trigger a lower-priority action.
- The browser ignores key release events.
- The browser component installs no listeners.

### Edge cases

- Inspection mode needs `preview`. It uses a one-based item index and permits copying, scrolling, and closure, not selection actions.
- Below 40 columns or 10 rows, only cancellation is available.

## Cancellation

**Ctrl+C** never cancels. Construction throws when no cancel binding remains after validation, exclusion of **Ctrl+C**, and copy-key precedence.

- Cancel returns from preview to the list, or closes from the list.
- While loading or an action is pending, cancel closes immediately.
- Closing does not undo effects already started by consumer callbacks.
- The footer keeps the back or close hint first when space is limited.

## Direct construction

The [browser host](../src/tui/open-browser/README.md) does these steps for you. When you construct `Browser` directly:

1. Await `browser.activate()` to load the initial section.
2. Call `browser.invalidate()` on presentation transitions. This cancels armed deletion without closing the logical browser or aborting preparation.
3. Call `browser.dispose()` at final closure, not during remounts.
