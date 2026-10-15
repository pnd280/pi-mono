# Working-message coordinator

[Library index](../../README.md#usage)

`@pi-mono/libs/working-message` combines extension contributions in Pi's working message. First registration installs the coordinator and `/working-message`; no separate extension needed.

## Behaviour

- Nonempty contributions are joined with `·` in the configured order. Unlisted components follow in sorted ID order.
- Empty contributions stay registered and in settings; no active text restores Pi's default message.
- An override from `overrideWorkingMessage` replaces the whole message while it has text. The most recently set override wins. Clearing it restores the combined message. Overrides do not appear in the settings menu.
- Text is terminal-sanitised and whitespace collapsed to one line. Overrides keep SGR styling, such as theme colours; contributions are plain text.
- Pi's event bus shares one owner across library instances. Shutdown removes it and invalidates handles. New sessions and reloads register fresh components.
- Nonparticipants can overwrite the message without interception. The indicator's content and visibility are unchanged.

### Settings menu

`/working-message` requires interactive TUI mode and saves ordering only on explicit confirmation. For scope precedence, draft behaviour, and menu keys, see [ordering and settings](ordering.md#settings-menu).

### Persistence

Global and trusted-project ordering uses Pi settings, not registrations. For paths, format, recovery behaviour, and save semantics, see [ordering and settings](ordering.md#persistence). Registrations alone do not write files; there are no network requests.

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

## Caller responsibilities

Register once during the extension factory, before installing handlers that publish text. Use a globally unique, stable ID such as `extension-name.component-name`; consult the [component schema](coordinator.ts) for character and length limits.

Register overrides in the extension factory too, and use them only for short, urgent text that must hide all contributions.

Keep handles runtime-local. Session start clears text. Republish restored state in `session_start` and update on state changes. `setText()` or `setText("")` clears only that component. `dispose()` unregisters it. Stale or disposed handles cannot mutate replacements. Clear text for temporary inactivity to retain settings visibility.

## Validation

Use [library checks](../../README.md#validation). [Settings tests](settings.test.ts) exercise filesystem integration. Use the [pi-todo offline fixture](../../../extensions/pi-todo/docs/validation.md#working-message-fixture) to check `/working-message` and the published text in real Pi, in regular and fullscreen modes.
