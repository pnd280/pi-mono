# Order settings

[Shared TUI](../../README.md#usage)

`OrderSettingsView` edits item order independently for each scope, such as global and project settings. Import it from `@pi-mono/libs/tui/components/order-settings`.

## Behavior

Up or Down selects an item, Shift+Up or Shift+Down moves it, and Tab switches scopes. The selection follows the moved item. Restoring the saved order clears the unsaved marker.

Only Ctrl+S calls the synchronous save callback, passing the scope ID and a copy of the order, even if unchanged. A successful save marks that scope's draft as saved. Errors leave the draft intact and display an error message. Escape or Ctrl+C closes and discards unsaved drafts without undoing earlier saves.

Each scope retains its own draft. `updateItems` refreshes text and appends new IDs in sorted order without losing selection or edits. Missing IDs remain as unavailable entries. The component sanitizes item labels and descriptions to single-line terminal text. The list respects terminal width and row limits, using Pi's injected theme, borders, and text wrapping. The component performs no I/O.

## Caller responsibilities

Supply at least one scope. Keep scope IDs, item IDs, and each initial order free of duplicates. Provide the exact save destinations, current terminal dimensions, and render and close callbacks. Keep the title and note safe for terminal display.

Persist and apply the order in the save callback. Return a user-facing success message or throw an `Error` with a message safe to display. Call `updateItems` when items change.

Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) when the same draft must survive inline and overlay remounts.

## Validation

Use the [library checks](../../../../README.md#validation). The [component tests](index.test.ts) cover selection, draft cancellation, scope isolation, successful and failed saves, item refreshes, unavailable IDs, scrolling, and size bounds.
