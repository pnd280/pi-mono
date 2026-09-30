# Todo terminal validation

[pi-todo](../README.md)

## Terminal launcher

From the workspace root, launch the isolated, offline fixture in each mode:

```sh
vpr 'pi-todo#validate:terminal' regular
vpr 'pi-todo#validate:terminal' fullscreen
```

The launcher prints and retains its temporary directory and loads no user settings or credentials. Add `--reuse <directory>` after the mode to reuse settings; reseed todos after process restarts because sessions are not saved. Edit only fixture settings, never real agent settings.

## Fullscreen paging checks

1. Submit `pages`. This clears fixture todos and creates 40 todos with long descriptions plus a scrollable transcript. Open `/todos`; check list/detail PageUp/PageDown at 80×24, narrow, and short sizes. Only the view should move, with the transcript fixed even at view boundaries. Fullscreen `/todos` must stay non-overlay.
2. In the fixture's `agent/keybindings.json`, set `tui.select.pageUp` and `tui.altScreen.pageUp` to `ctrl+pageUp`, and both `pageDown` actions to `ctrl+pageDown`. Run `/reload` and repeat. Also check disabled paging (`[]`) and keys assigned to cancel or confirm: those bindings must not be reserved as paging.
3. Open transcript search with `tui.altScreen.search` (Ctrl+Shift+F; Ctrl+F on Windows and WSL). Paging must not reach todos until Escape closes search.
4. Close and reopen repeatedly, then check after `/reload` and `/new`. Confirm transcript paging, editor focus, and widget restoration after closure; `/new` must clear old todos. Submit `pages` again to repeat the checks.
5. Open `/working-message`: arrows navigate the menu; page keys retain ordinary host routing. Repeat todo navigation, cancellation, remapped keys, resizing, and widget restoration in regular mode.

## Working-message fixture

Use the [offline launcher](#terminal-launcher) in both modes:

1. Submit `seed`, then `hold`: expect `Checking composition · Other status` for 30 seconds; Escape cancels.
2. During `hold`, open `/working-message`; check active entries, `fixture.inactive`, and `unavailable.activity`. Select with Up/Down and reorder with Shift+Up/Down. The working message must stay unchanged while editing. Resize narrow, Escape, and reopen; unsaved order must be discarded.
3. Tab between scopes; Ctrl+S different global/project orders. Saving global must preserve the active project override. Reopen and restart with `--reuse <directory>`; verify saved orders and unavailable IDs.
4. Make a draft change, then externally set `workingMessage` to `null` in the displayed fixture settings file. Ctrl+S must report an error, retain the draft and selection, and leave the file unchanged. Restore a valid object and retry. An invalid `order` inside an otherwise valid object may instead be replaced by an explicit save; unrelated fields must survive.
5. Use `hold` after `/todos expand` and `/todos collapse`; `Other status` must remain. `/fixture-status` clears it; `/fixture-status Other status` restores it. Expanded widget plus cleared status must show Pi's default message.
6. In fullscreen mode, clicking the widget toggles collapse and the working-message activity. In regular mode, `/todos collapse` reports an error and the widget stays expanded; switching modes applies or suspends the collapse preference.
7. Collapse and restore `Other status`. Use `hold` after `/reload` to check restored activity without duplicates, and after `/new` to check old activity is cleared.
