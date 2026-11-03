# [pi-todo](README.md) development

Leave tool cards to the host. Attach no renderer fields to the tool definition.

## Must not regress

- Keep every mutation atomic, and every result fully replayable.
- Keep the hierarchy independent of status and dependencies.

## Constraints

- Reuse shared terminal sanitisation and [custom-UI mounting](../../libs/src/tui/responsive-custom-ui/README.md).
- Publish activity through the [working-message coordinator](../../libs/src/working-message/README.md), never directly to Pi.
- Keep UI ownership local. In fullscreen mode, use UI that isn't an overlay, without changing global keybindings.

## Validation

| When you…                                         | Read                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| Change the widget, browser, or working-message UI | [interactive checks](docs/validation.md)            |
| Upgrade Pi                                        | [compatibility checklist](docs/pi-compatibility.md) |
