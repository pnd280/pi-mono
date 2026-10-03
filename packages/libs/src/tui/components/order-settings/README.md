# Order settings

[Shared TUI](../../README.md#usage)

Use [`OrderSettingsView`](index.ts) to edit item order with independent drafts, saving, and cancellation for each scope, such as global and project settings.

## Behaviour

- Each scope retains its own draft.
- **Up** and **Down** select, **Shift+Up** and **Shift+Down** move, **Tab** and **Shift+Tab** switch scopes, **Ctrl+S** saves, and **Escape** or **Ctrl+C** closes without applying unsaved edits.
- Native transcript paging remains with the host.
- Scopes with `isSet: false` show `(not set)` until saved successfully, even if the draft is unchanged.
- Saving calls the synchronous callback even for an unchanged draft.
- Errors retain drafts; closing does not undo prior saves.
- Unset scopes inherit only saved, set `inheritFrom` sources.
- Source saves update unedited dependent drafts; inheritance neither copies unsaved edits nor marks scopes set.
- `updateItems` refreshes items without losing drafts; missing IDs remain as unavailable entries.
- The component performs no I/O.

## Caller responsibilities

- Supply at least one scope with unique scope and item IDs and duplicate-free initial orders.
- Supply each scope's destination, `order`, and `isSet`; persisted orders, even empty, use `isSet: true`.
- Optional `inheritFrom` names another scope; the local `order` is the fallback when the source is unset or unspecified.
- Persist and apply the order in the `save` callback.
- Return `SettingsFeedback`, normally from `settingsSaveFeedback`, or throw an `Error` whose first line explains recovery and whose remaining lines give details.
- Optional `warnings` supplies initial load diagnostics.
- Configure `inheritFrom` according to actual precedence; consumers with global and project scopes must never inherit project overrides into global drafts.
- Call `updateItems` when items change.
- Mount through the [responsive custom UI host](../../responsive-custom-ui/README.md) when the same draft must survive inline and overlay remounts.

## Validation

Use the [library checks](../../../../README.md#validation); [working-message command tests](../../../working-message/command.test.ts) exercise the editor through the installed host.
