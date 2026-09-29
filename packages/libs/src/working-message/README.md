# Working-message coordinator

[Library index](../../README.md#usage)

`@pi-mono/libs/working-message` combines extension contributions in Pi's working message. First registration installs the coordinator and `/working-message`; no separate extension needed.

## Behavior

- Nonempty contributions are joined with `·` in the configured order. Unlisted components follow in sorted ID order.
- Empty contributions remain registered/in settings; no active text restores Pi's default message.
- Text is terminal-sanitized and whitespace collapsed to one line.
- Pi's event bus shares one owner across library instances. Shutdown removes it and invalidates handles; sessions/reloads register fresh components.
- Nonparticipants can overwrite the message without interception. Indicator content/visibility is unchanged.

### Settings menu

`/working-message` requires interactive TUI mode and saves ordering only on explicit confirmation. For scope precedence, draft behavior, and menu keys, see [ordering and settings](ordering.md#settings-menu).

### Persistence

Global and trusted-project ordering uses Pi settings, not registrations. For paths, format, recovery behavior, and save semantics, see [ordering and settings](ordering.md#persistence). Registrations alone do not write files; there are no network requests.

## Caller responsibilities

Register once during the extension factory, before installing handlers that publish text. Use a globally unique, stable ID such as `extension-name.component-name`; consult the [component schema](coordinator.ts) for character and length limits.

Keep handles runtime-local. Session start clears text; republish restored state in `session_start` and update on state changes. `setText()`/`setText("")` clears only that component; `dispose()` unregisters it. Stale/disposed handles cannot mutate replacements. Clear text for temporary inactivity to retain settings visibility.

## Usage

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";

export default function activityExtension(pi: ExtensionAPI) {
  const activity = registerWorkingMessage(pi, {
    id: "example.activity",
    label: "Activity",
    contributor: "example"
  });

  pi.on("agent_start", () => activity.setText("Checking files"));
  pi.on("agent_end", () => activity.setText());
}
```

## Validation

Use [library checks](../../README.md#validation). [Composition](coordinator.test.ts), [registration](index.test.ts), [settings](settings.test.ts), and [command](command.test.ts) tests cover the library; draft/input tests belong to [order-settings](../tui/components/order-settings/README.md#validation). Use the [pi-todo offline fixture](../../../extensions/pi-todo/docs/validation.md#working-message-fixture) for real Pi checks in regular and fullscreen modes.
