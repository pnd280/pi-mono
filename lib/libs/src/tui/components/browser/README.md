# Collection browser

[Shared TUI](../../README.md#usage)

## Behaviour

Extensions that need searchable sections with selection, previews, and actions use the collection browser. Use the [browser contracts](types.ts) for options and action signatures; [layout policy](layout.ts) chooses inline or overlay presentation.

- Sections retain their own queries and selections.
- A query edit selects the first result.
- Stable item keys preserve selection through section switches and refresh.
- After a query edit, the previous results stay visible while the search is pending. If the search takes longer than 200 ms, a loading message replaces the results and their action hints. Other searches show the message at once.
- While a search is pending, only query editing, section switching, and cancellation are available.
- While a removal or selection action is pending, only cancellation is allowed.
- Late results cannot reopen a closed browser.
- `details` show below the results for the selected item. They take at most half of the rows, and `…` marks rows that do not fit.
- `preview` opens a separate scrollable view. Without it, **Ctrl+P** does nothing and has no hint.

### Keys and cancellation

The browser uses Pi's selection keybindings plus fixed keys for sections, preview, removal, and the alternate action. For the key precedence, fixed keys, input routing, and small-terminal edge cases, see the [browser keys guide](../../../../docs/tui-browser.md#keys).

**Ctrl+C** never cancels. Construction requires a cancel binding other than **Ctrl+C** that is not also bound to copy.

- Cancel returns from preview to the list, or closes from the list.
- While loading or an action is pending, cancel closes immediately.
- Closing does not undo effects already started by consumer callbacks.
- The footer keeps the back or close hint first when space is limited.

## Caller responsibilities

The browser owns presentation and interaction; the caller owns data, search, and effects.

### Sections and items

- Supply at least one section, unique IDs, and an existing initial section.
- Supply stable unique snapshot item keys.
- `load(signal)` returns prepared items and an optional status `message`.
- Pass the activation signal through preparation; it is aborted on reactivation or final closure, not remount.
- The `search` callback filters and ranks results and must honour the supplied `current` callback.
- Supply terminal-safe rows, details, and previews, and keep the exact source separately.
- Prepare `details` before the browser opens and keep them short. The browser wraps them synchronously.
- Format only the visible window. Keep its item count and order, and use width-preserving styles.

### Actions and errors

- `remove.run(item, signal)` returns a committed snapshot, or `undefined` after reporting failure.
- Use the removal signal only to cancel replacement-snapshot preparation, never effects already started.
- Errors from loading and the initial search are shown directly, so use terminal-safe messages.
- Errors from actions and later searches go to `onError`.
- `cancelError` chooses the diagnostic for unusable cancel bindings.

### Mounting

Use the [browser host](../../open-browser/README.md) for Pi mounting and effects after closure. If you construct `Browser` directly, follow the [direct construction steps](../../../../docs/tui-browser.md#direct-construction).

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
    ctx.ui.notify(
      "Fullscreen input routing is unavailable. Use regular mode if controls do not respond.",
      "warning"
    ),
  afterClose: () => {
    if (selected !== undefined) return openSelectedFile(selected);
  }
});
```

## Validation

Use the [package checks](../../../../README.md#validation). The browser has no component tests; the [browser host tests](../../open-browser/index.test.ts) exercise list and preview paging, remounts, and cancellation through Pi's renderer. Check sections, actions, and layout with prompt manager's [presentation scenarios](../../../../../extensions/pi-prompt-manager/docs/validation.md#presentation-preview-or-responsive-mounting).
