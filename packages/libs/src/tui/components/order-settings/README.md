# Order settings

[Shared TUI](../../README.md#usage)

`OrderSettingsView` edits item order independently for each scope, such as global and project settings. Import it from `@pi-mono/libs/tui/components/order-settings`.

## Behavior

Each scope retains its own draft. Up or Down selects an item, Shift+Up or Shift+Down moves it, and Tab or Shift+Tab switches scopes.

Scopes with `isSet: false` show `(not set)` until saved successfully, even if the draft is unchanged.

Only Ctrl+S calls synchronous save with scope ID and copied order, even unchanged. Errors display and retain drafts; Escape/Ctrl+C discard unsaved drafts without undoing saves.

Unset scopes inherit only saved, set `inheritFrom` sources. Source saves replace unedited dependent drafts, preserving selection. Inheritance neither copies unsaved edits nor marks scopes set.

`updateItems` refreshes text and appends new IDs in sorted order without losing selection or edits. Missing IDs remain as unavailable entries. The component sanitizes item labels and descriptions to single-line terminal text. It performs no I/O.

## Caller responsibilities

Supply at least one scope, unique scope/item IDs, duplicate-free initial orders, and each scope's destination, `order`, and `isSet`. Persisted orders, even empty, use `isSet: true`. Optional `inheritFrom` names another scope; local `order` is fallback for unset/unspecified sources.

Provide the injected theme, a `rows` function that returns the current terminal row count, a `requestRender` callback, and a `close` callback. Keep the title safe for terminal display.

Persist and apply the order in the `save` callback. Return a user-facing success message or throw an `Error` with a message safe to display. Call `updateItems` when items change.

Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) when the same draft must survive inline and overlay remounts.

## Validation

Use the [library checks](../../../../README.md#validation). The [component tests](index.test.ts) cover scope drafts and inheritance, unset markers, selection, cancellation, successful and failed saves, item refreshes, unavailable IDs, scrolling, and size bounds.
