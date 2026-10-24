# Todo browser, widget, and settings

[pi-todo](../README.md)

This guide lists the controls and limits of the `/todos` browser, the widget, and the `ext.pi-todo` settings. The [package README](../README.md) gives the overview.

## The `/todos` browser

`/todos` opens a snapshot of the list. Reopen it to see later changes. The browser uses Pi's `tui.select.*` bindings. The keys below are defaults.

| Key                      | Action                                 |
| ------------------------ | -------------------------------------- |
| **Up**, **Down**         | Move the selection.                    |
| **Enter**                | Show details.                          |
| **Escape**               | Go back, or close.                     |
| **PageUp**, **PageDown** | Move the selection, or scroll details. |

- **Ctrl+C** never closes the browser.
- The browser opens only if `tui.select.cancel` has a usable key other than **Ctrl+C**. Pi 1.4.0 can't use modified Escape or modified function-key bindings. If no usable key is bound, fix Pi's keybindings and run `/reload`.
- The footer keeps back or close first when space is limited. An empty list shows only the close hint.

### Fullscreen mode

In fullscreen mode, `/todos` is never shown as an overlay. While the view has focus, browser keys, including remapped ones, take priority over transcript controls.

If Pi can't give the browser this priority, a warning appears each time you open `/todos`, and the browser stays open. If controls don't respond, use regular mode.

## The widget

In fullscreen mode, `/todos collapse`, `/todos expand`, and `/todos toggle` control the widget for the current session. Clicking the widget also toggles it.

In regular mode the widget is always expanded, and these commands report an error. Your collapse preference applies again when you switch back to fullscreen.

### Working-message order

While the widget is collapsed, the working message shows the active todo instead. Expanding the widget removes it. To change where it appears among other working-message items, run `/working-message`:

| Key                          | Action                                      |
| ---------------------------- | ------------------------------------------- |
| **Shift+Up**, **Shift+Down** | Move the selected item.                     |
| **Ctrl+S**                   | Save. Changes apply only when you save.     |
| **Escape**, **Ctrl+C**       | Close the menu and discard unsaved changes. |

For scopes and the other keys, see [working-message ordering](../../../libs/src/working-message/ordering.md#settings-menu).

Working-message order is a separate setting, `workingMessage.order`, which `/working-message` saves. A trusted project's `order` replaces the global one. For the file format and recovery from invalid settings, see [working-message persistence](../../../libs/src/working-message/ordering.md#persistence).

## Settings

The `ext.pi-todo` key goes in Pi's global settings file, `~/.pi/agent/settings.json` (or `$PI_CODING_AGENT_DIR/settings.json` when that's set), or in `.pi/settings.json` in the current directory of a [trusted](https://pi.dev/docs/latest/security#understand-project-trust) project.

- `collapseWidgetByDefault` defaults to `false` and affects fullscreen mode only.
- A trusted project's value overrides the global one.
- Settings load on session start. Widget commands never write settings.
- Invalid settings are ignored.
- A settings file is ignored if it can't be read, isn't a regular file, isn't valid UTF-8 JSON, is larger than 1 MiB, or changes size while Pi reads it.
