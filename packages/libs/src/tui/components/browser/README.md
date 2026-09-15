# Collection browser

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/browser`](index.ts) exports `Browser`, its option types, and `browserLayout`.

The browser manages selection, per-section queries, search cancellation, preview scrolling, timed removal confirmation, input precedence, and layout. Sections can have different data sources and optional confirm, alternate, copy, and removal actions.

Selection uses caller-supplied stable keys, including when filtering or refreshing data. A successful removal replaces the snapshot and selects a nearby result. Failed removal retains the query, selection, and preview. While removal, confirm, or alternate callbacks are pending, only cancellation is available. Copying leaves interaction available. Late results cannot reopen a closed browser.

Configured actions take precedence in this order: copy, cancel, confirm, up, down, page up, page down. Fixed controls come next, followed by search editing:

| Fixed control    | Action                                                     |
| ---------------- | ---------------------------------------------------------- |
| Tab or Shift+Tab | Advance to the next section                                |
| Ctrl+P           | Open preview                                               |
| Delete twice     | Confirm removal within the section's confirmation deadline |
| Alt+Enter        | Invoke the alternate action                                |

Action hints show the first usable binding after resolving conflicts, or an `unavailable` label if none remains. Hints omit actions absent from the section and fixed controls with no remaining binding. Configured keys remain reserved even when the section has no corresponding action.

Ctrl+C never cancels. Construction requires a cancel binding other than Ctrl+C that is not also bound to copy.

Cancel returns from preview to the list, or closes the browser from the list. During a pending removal or selection action, cancel closes the browser even from preview. Closing does not cancel effects already started by consumer callbacks.

Inspection mode selects a one-based item index and allows only copying, scrolling, and closure. Confirm closes without invoking a selection action.

Below 40 columns or 10 terminal rows, only cancellation is available. Inline height is three quarters of the terminal height after reserving three rows for the host UI, rounded down. If that leaves fewer than 12 rows, the browser uses an overlay with three quarters of the terminal height, rounded down. Resizing cancels confirmation but preserves the query, input cursor, selection, and preview position.

## Caller responsibilities

Supply at least one section, unique section IDs, an existing initial section, and stable unique item keys within each snapshot. Sections may be empty. The browser treats item values as opaque.

`load(signal)` returns prepared items and an optional status message. Each section activation gets a new signal, shared with `remove.run`. The next activation or final closure aborts it. Responsive remounts do not abort it. Pass the signal through loading and preparation to stop obsolete work.

The `search` callback filters and ranks results and must honor the supplied `current` callback.

Supply terminal-safe row and preview text while retaining exact source separately. The row formatter receives only the visible window and must preserve its count and order. It can choose columns, metadata, and width-preserving styles. Preview metadata is optional.

Confirm and alternate callbacks perform their actions and return `true` to close or `false` to remain open.

`remove.run(item, signal)` returns a committed snapshot, or `undefined` after reporting failure. Use its signal only to cancel preparation of the replacement snapshot, never to cancel effects already started. `remove.enabled` controls whether an item can be removed.

Errors during section loading or its initial search appear in the browser, so their messages must be safe to disclose. Action errors and subsequent search errors go to `onError`. Supply `cancelError` to choose the error type and message when no usable cancel binding exists.

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
  afterClose: () => {
    if (selected !== undefined) return openSelectedFile(selected);
  }
});
```

## Validation

Use the [package checks](../../../../README.md#validation). Tests cover multiple sections, action availability, dimensions, cancellation, and input routing between the list and preview.
