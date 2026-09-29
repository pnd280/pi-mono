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

`/working-message` takes no arguments and requires interactive TUI mode. It opens the project scope when an override exists, otherwise the global scope. Switch scopes inside the menu with Tab; project scope requires a trusted project.

An unset project draft inherits saved global ordering; an unset global draft sorts IDs. Inheritance does not write settings. An explicit empty order is set and uses sorted ID order.

| Key                    | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| Up or Down             | Select a component, stopping at boundaries             |
| Shift+Up or Shift+Down | Move the selected component                            |
| Tab or Shift+Tab       | Switch between global and project drafts               |
| Ctrl+S                 | Save the displayed scope and apply the effective order |
| Escape or Ctrl+C       | Close and discard all remaining unsaved drafts         |

Menu keys are fixed, independent of Pi's browser bindings. Only saved drafts affect the message; failed saves retain drafts for retry. Global saves preserve project precedence. The menu never enables or disables components.

The menu uses the [shared settings frame](../tui/components/settings-menu/README.md); resize terminals smaller than 40×10 for the full view.

### Persistence

Global ordering lives in `getAgentDir()/settings.json` (honoring `PI_CODING_AGENT_DIR`); trusted project overrides live in `<cwd>/.pi/settings.json`, using Pi's configured directory name.

```json
{
  "workingMessage": {
    "order": ["pi-todo.activity", "another-extension.status"]
  }
}
```

A project `order` replaces the global array; removing it restores inheritance. Unknown IDs retain their positions through temporary contributor removal. See the [settings schema](settings.ts) for order limits.

Settings load at session start and when the menu opens. Invalid settings or read failures produce terminal-safe warnings and fall back to the other valid scope or sorted IDs. Opening the menu does not apply an order.

Saves use [locked atomic settings updates](../settings-file/README.md#behavior), preserving unrelated fields and existing symlinks. An explicit save can replace an invalid `order` in an otherwise valid section, but never repairs a malformed file or section. Registrations alone do not write files; there are no network requests.

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
