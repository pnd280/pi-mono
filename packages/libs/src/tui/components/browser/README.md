# Collection browser

[Shared TUI](../../README.md#usage)

## Behavior

Use the [browser contracts](types.ts) for options and action signatures; [layout policy](layout.ts) chooses inline or overlay presentation.

Sections retain their own queries and selections. Stable item keys preserve selection through search and refresh; pending removal/selection actions allow only cancellation. Late results cannot reopen a closed browser.

### Keys and cancellation

Configured actions take precedence in this order: copy, cancel, confirm, up, down, page up, page down. Fixed controls are Tab/Shift+Tab (section), Ctrl+P (preview), Delete twice (removal), and Alt+Enter (alternate action).

The [browser host](../../open-browser/README.md) routes eligible fullscreen paging ahead of transcript paging. Keys assigned to higher-priority actions and release events are not claimed; the browser component installs no listeners.

Ctrl+C never cancels. Construction requires a cancel binding other than Ctrl+C that is not also bound to copy.

Cancel returns from preview to the list, or closes from the list; while loading or an action is pending, it closes immediately. Closing does not undo effects already started by consumer callbacks.

Inspection mode uses a one-based item index and permits copying, scrolling, and closure, not selection actions. Below 40 columns or 10 rows, only cancellation is available.

## Caller responsibilities

Supply at least one section, unique IDs, an existing initial section, and stable unique snapshot item keys.

`load(signal)` returns prepared items/optional status. Pass the activation signal through preparation; it is aborted on reactivation or final closure, not remount.

The `search` callback filters and ranks results and must honor the supplied `current` callback.

Supply terminal-safe rows/previews and retain exact source separately. Format only the visible window, preserving count/order and width-preserving styles.

`remove.run(item, signal)` returns a committed snapshot, or `undefined` after reporting failure. Use its signal only to cancel replacement-snapshot preparation, never effects already started.

Load/initial-search errors display directly: use terminal-safe messages. Action/later-search errors go to `onError`. `cancelError` chooses the diagnostic for unusable cancel bindings.

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
