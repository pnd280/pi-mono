# Collection browser

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/browser`](index.ts) exports `Browser`, its option types, and `browserLayout`.

Sections retain queries/selections and may supply distinct sources and confirm, alternate, copy, or remove actions. Switching keeps preview open on the destination selection from the top; empty results/load failure return to the list.

Stable keys preserve selection through search/refresh. Successful removal replaces the snapshot and selects nearby; failure retains query, selection, and preview. Pending remove/confirm/alternate actions allow only cancel; copy allows interaction. Late results cannot reopen closed browsers.

### Keys and cancellation

Configured actions take precedence in this order: copy, cancel, confirm, up, down, page up, page down. Fixed controls come next, followed by search editing:

| Fixed control    | Action                                                     |
| ---------------- | ---------------------------------------------------------- |
| Tab or Shift+Tab | Advance to the next section                                |
| Ctrl+P           | Open preview                                               |
| Delete twice     | Confirm removal within the section's confirmation deadline |
| Alt+Enter        | Invoke the alternate action                                |

`ownsFullscreenInput(data)` reserves paging for the view even during loading, pending actions, or undersized layout. It uses the precedence above: disabled paging bindings, keys assigned to higher-priority actions, and release events are not claimed. The [browser host](../../open-browser/README.md) provides priority routing; the component installs no listeners.

Hints show first usable bindings or `unavailable`. They omit absent actions, item actions without a ready selection, ineligible removal, and fully overridden fixed controls. During pending removal or selection actions, the footer retains the close key and names the operation. Configured keys stay reserved even for absent actions. During search preparation, selection hints remain but item actions wait for completion.

Ctrl+C never cancels. Construction requires a cancel binding other than Ctrl+C that is not also bound to copy.

Cancel returns from preview to the list, or closes the browser from the list. During loading or a pending removal or selection action, cancel closes the browser even from preview. Closing does not cancel effects already started by consumer callbacks.

Inspection mode selects a one-based item index and allows only copying, scrolling, and closure. Confirm closes without invoking a selection action.

### Layout

Below 40 columns or 10 terminal rows, only cancellation is available. Otherwise, the browser chooses its layout from the terminal height:

- Inline height is `floor((terminalRows - 3) × 3/4)`, reserving three rows for the host UI.
- If the inline height would be less than 12 rows, the browser uses an overlay with height `floor(terminalRows × 3/4)`.

Resizing cancels confirmation but preserves the query, input cursor, selection, and preview position. Compact layouts retain the section or inspection heading above collection status, so recovery messages do not replace collection identity.

## Caller responsibilities

Supply at least one section, unique IDs, an existing initial section, and stable unique snapshot item keys. Empty sections are allowed; item values are opaque.

`load(signal)` returns prepared items/optional status. Each activation's signal is shared with `remove.run`, aborted on next activation/final closure, never remount. Pass it through loading/preparation.

The `search` callback filters and ranks results and must honor the supplied `current` callback.

Supply terminal-safe rows/previews; retain exact source separately. Format only the visible window, preserving count/order; choose columns, metadata, and width-preserving styles. Preview metadata is optional.

Confirm and alternate callbacks perform their actions and return `true` to close or `false` to remain open.

`remove.run(item, signal)` returns a committed snapshot, or `undefined` after reporting failure. Use its signal only to cancel preparation of the replacement snapshot, never to cancel effects already started. `remove.enabled` controls whether an item can be removed.

Load/initial-search errors display directly: use safe messages. Action/later-search errors go to `onError`. A failed later search clears stale results, shows a generic unavailable message, and allows a new query to retry. `cancelError` chooses type/message for unusable cancel bindings.

Use the [browser host](../../open-browser/README.md) for Pi mounting and effects after closure. When constructing `Browser` directly, await `browser.controller.activate()` and call `browser.dispose()` at final closure, not during remounts.

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

Use the [package checks](../../../../README.md#validation). Tests cover multiple sections, action availability, dimensions, cancellation, and input routing between the list and preview.
