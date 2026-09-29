# Order settings

[Shared TUI](../../README.md#usage)

[`OrderSettingsView`](index.ts) edits item order independently for each scope, such as global and project settings.

## Behavior

Each scope retains its own draft. Up/Down selects, Shift+Up/Down moves, Tab/Shift+Tab switches scopes, Ctrl+S saves, and Escape/Ctrl+C closes without applying unsaved edits. Native transcript paging remains with the host.

Scopes with `isSet: false` show `(not set)` until saved successfully, even if the draft is unchanged.

Saving calls the synchronous callback even for an unchanged draft. Errors retain drafts; closing does not undo prior saves.

Unset scopes inherit only saved, set `inheritFrom` sources. Source saves update unedited dependent drafts; inheritance neither copies unsaved edits nor marks scopes set.

`updateItems` refreshes items without losing drafts; missing IDs remain as unavailable entries. The component performs no I/O.

## Caller responsibilities

Supply at least one scope, unique scope/item IDs, duplicate-free initial orders, and each scope's destination, `order`, and `isSet`. Persisted orders, even empty, use `isSet: true`. Optional `inheritFrom` names another scope; local `order` is fallback for unset/unspecified sources.

Persist and apply the order in the `save` callback. Return `SettingsFeedback`, normally from `settingsSaveFeedback`, or throw an `Error` whose first line explains recovery and whose remaining lines give details. Optional `warnings` supplies initial load diagnostics. Configure `inheritFrom` according to actual precedence; global/project consumers must never inherit project overrides into global drafts. Call `updateItems` when items change.

Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) when the same draft must survive inline and overlay remounts.

## Validation

Use the [library checks](../../../../README.md#validation) and [component tests](index.test.ts) for drafts, inheritance, saving, and constrained layouts.
