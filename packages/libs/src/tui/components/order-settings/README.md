# Order settings

[Shared TUI](../../README.md#usage)

`OrderSettingsView` edits item order independently for each scope, such as global and project settings. Import it from `@pi-mono/libs/tui/components/order-settings`.

## Behavior

Each scope retains its own draft. Up or Down selects an item, Shift+Up or Shift+Down moves it, and Tab or Shift+Tab switches scopes. The selection follows the moved item. Restoring the saved order clears the unsaved marker.

The header highlights the active scope's tab. Scopes with `isSet: false` show `(not set)` until saved successfully, even if the draft is unchanged. Tabs wrap between scopes at narrow widths.

Only Ctrl+S calls the synchronous save callback, passing the scope ID and a copy of the order, even if unchanged. A successful save marks that scope's draft as saved. Errors leave the draft intact and display an error message. Escape or Ctrl+C closes and discards unsaved drafts without undoing earlier saves.

An unset scope inherits the saved order of its `inheritFrom` source only when that source is set. Saving the source updates the inherited order, replacing the dependent draft only if it has no unsaved edits. The selected item is preserved. Inheritance never copies unsaved source edits or marks a scope as set.

`updateItems` refreshes text and appends new IDs in sorted order without losing selection or edits. Missing IDs remain as unavailable entries. The component sanitizes item labels and descriptions to single-line terminal text. It performs no I/O.

## Caller responsibilities

Supply at least one scope. Give scopes and items unique IDs, and keep each initial order free of duplicates. Provide each scope's save destination, `order`, and `isSet` flag. Set `isSet` to `true` for a persisted order, including an empty order.

To inherit a saved order while a scope is unset, set its `inheritFrom` to another scope's ID. The scope's own `order` is the fallback when the source is unset or unspecified.

Provide the injected theme, a `rows` function that returns the current terminal row count, a `requestRender` callback, and a `close` callback. Keep the title safe for terminal display.

Persist and apply the order in the `save` callback. Return a user-facing success message or throw an `Error` with a message safe to display. Call `updateItems` when items change.

Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) when the same draft must survive inline and overlay remounts.

## Validation

Use the [library checks](../../../../README.md#validation). The [component tests](index.test.ts) cover scope drafts and inheritance, unset markers, selection, cancellation, successful and failed saves, item refreshes, unavailable IDs, scrolling, and size bounds.
