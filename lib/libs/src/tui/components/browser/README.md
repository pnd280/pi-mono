# Collection browser

[Shared TUI](../../README.md#usage)

Extensions that let a user pick from a collection need searchable sections, selection, previews, and actions that behave the same in every extension. The collection browser provides them; open it with [`openBrowser`](../../open-browser/README.md), and use the [browser contracts](types.ts) for options and action signatures. `@pi-mono/libs/tui/components/browser` exports only these types.

## Behaviour

- Sections retain their own queries and selections.
- A query edit selects the first result.
- Stable item keys preserve selection through section switches and refresh.
- Pending searches and actions limit input to safe controls, such as cancellation.
- `details` show below the results for the selected item, and `preview` opens a separate scrollable view.
- The browser uses Pi's selection keybindings plus fixed keys for sections, preview, removal, and the alternate action.
- **Ctrl+C** never cancels. Cancel returns from preview to the list, or closes from the list.
- Closing does not undo effects already started by consumer callbacks.
- Late results cannot reopen a closed browser. Only the newest section search commits its results; the [latest-task helper](latest-task.ts) discards obsolete ones without aborting their work.
- The browser aborts the activation signal on reactivation or final closure, not on remount.
- The [layout policy](layout.ts) chooses inline or overlay presentation.

| When you…                                                        | Read                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Need the loading delay or the controls available while pending   | [Searches and pending actions](../../../../docs/tui-browser.md#searches-and-pending-actions) |
| Size `details` or add a preview                                  | [Details and preview](../../../../docs/tui-browser.md#details-and-preview)                   |
| Remap keys, or debug key precedence and small-terminal behaviour | [Browser keys](../../../../docs/tui-browser.md#keys)                                         |
| Need the exact cancel and close rules                            | [Cancellation](../../../../docs/tui-browser.md#cancellation)                                 |

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

## Caller responsibilities

Own data, search, and effects, following the [shared TUI ownership rule](../../README.md#usage).

### Sections and items

- Supply at least one section, unique IDs, and an existing initial section.
- Supply stable unique snapshot item keys.
- Return prepared items and an optional status `message` from `load(signal)`.
- Pass the activation signal through preparation.
- Filter and rank results in the `search` callback, and honour the supplied `current` callback.
- Supply terminal-safe rows, details, and previews, and keep the exact source separately.
- Prepare `details` before the browser opens and keep them short.
- Format only the visible window. Keep its item count and order, and use width-preserving styles.

### Actions and errors

- Return a committed snapshot from `remove.run(item, signal)`, or report the failure and return `undefined`.
- Use the removal signal only to cancel replacement-snapshot preparation, never effects already started.
- Supply useful messages for errors from loading and the initial search. The browser sanitises them before display.
- Handle errors from actions and later searches in `onError`.
- Bind cancel to a key other than **Ctrl+C** that is not also bound to copy. Otherwise construction throws `cancelError`, or a default error when you supply none.

### Mounting

Use the [browser host](../../open-browser/README.md) for Pi mounting and effects after closure.

Related: the [shared TUI validation](../../README.md#validation) lists the browser tests and terminal scenarios.
