# Collection browser

[Shared TUI](../../README.md#usage)

## Behaviour

Extensions that need searchable sections with selection, previews, and actions use the collection browser. Use the [browser contracts](types.ts) for options and action signatures; [layout policy](layout.ts) chooses inline or overlay presentation.

- Sections retain their own queries and selections.
- Stable item keys preserve selection through search and refresh.
- While a removal or selection action is pending, only cancellation is allowed.
- Late results cannot reopen a closed browser.

### Keys and cancellation

Configured actions take precedence in this order: `copy`, `cancel`, `confirm`, `up`, `down`, `pageUp`, `pageDown`. Fixed controls are **Tab** and **Shift+Tab** (next and previous section), **Ctrl+P** (preview), **Delete** twice (remove), and **Alt+Enter** (alternate action).

- The [browser host](../../open-browser/README.md) routes eligible fullscreen paging ahead of transcript paging.
- Keys assigned to higher-priority actions and release events are not claimed.
- The browser component installs no listeners.

**Ctrl+C** never cancels. Construction requires a cancel binding other than **Ctrl+C** that is not also bound to copy.

- Cancel returns from preview to the list, or closes from the list.
- While loading or an action is pending, cancel closes immediately.
- Closing does not undo effects already started by consumer callbacks.

Edge cases:

- Inspection mode uses a one-based item index and permits copying, scrolling, and closure, not selection actions.
- Below 40 columns or 10 rows, only cancellation is available.

## Caller responsibilities

- Supply at least one section, unique IDs, and an existing initial section.
- Supply stable unique snapshot item keys.
- `load(signal)` returns prepared items and an optional status.
- Pass the activation signal through preparation; it is aborted on reactivation or final closure, not remount.
- The `search` callback filters and ranks results and must honour the supplied `current` callback.
- Supply terminal-safe rows and previews, and keep the exact source separately.
- Format only the visible window, keeping its count and order and width-preserving styles.
- `remove.run(item, signal)` returns a committed snapshot, or `undefined` after reporting failure.
- Use the removal signal only to cancel replacement-snapshot preparation, never effects already started.
- Errors from loading and the initial search are shown directly, so use terminal-safe messages.
- Errors from actions and later searches go to `onError`.
- `cancelError` chooses the diagnostic for unusable cancel bindings.
- Use the [browser host](../../open-browser/README.md) for Pi mounting and effects after closure.
- When constructing `Browser` directly, await `browser.activate()` to load the initial section and call `browser.dispose()` at final closure, not during remounts.
- Call `browser.invalidate()` on presentation transitions to cancel armed deletion without closing the logical browser or aborting preparation.

## Usage

```ts
import { openBrowser } from "@pi-mono/libs/tui/open-browser";

let selected: (typeof files)[number] | undefined;

await openBrowser({
  ui: ctx.ui,
  signal,
  browser: {
    initialSection: "files",
    sections: [
      {
        id: "files",
        label: "files",
        load: async () => ({ items: files }),
        confirm: {
          label: "open",
          run: (file) => {
            selected = file;
            return true;
          }
        }
      }
    ],
    key: (file) => file.path,
    search: searchFiles,
    format: (visible) => ({
      items: visible.map((file) => ({ value: file.path, label: file.name }))
    }),
    preview: (file) => ({ text: file.preview })
  },
  onError: reportError,
  onInputRoutingUnavailable: () =>
    ctx.ui.notify("Fullscreen paging is unavailable; use arrows.", "warning"),
  afterClose: () => {
    if (selected !== undefined) return openSelectedFile(selected);
  }
});
```

## Validation

Use the [package checks](../../../../README.md#validation). The browser has no component tests; the [browser host tests](../../open-browser/index.test.ts) exercise list and preview paging, remounts, and cancellation through Pi's renderer. Check sections, actions, and layout with prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
