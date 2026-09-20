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

`/working-message` requires interactive TUI mode. It opens the project scope when an override exists, otherwise the global scope. `/working-message global` and `/working-message project` select a scope explicitly. Project scope requires a trusted project.

Tabs show `(not set)` without valid saved order; explicit empty orders count as set. Only successful scope saves clear the marker. Unset drafts inherit the other saved scope or sorted IDs. Saving the source refreshes unedited inherited drafts; inheritance neither writes settings nor changes precedence.

| Key                    | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| Up or Down             | Select a component                                     |
| Shift+Up or Shift+Down | Move the selected component                            |
| Tab or Shift+Tab       | Switch between global and project drafts               |
| Ctrl+S                 | Save the displayed scope and apply the effective order |
| Escape or Ctrl+C       | Close and discard all remaining unsaved drafts         |

Only saved drafts affect the message; failures retain drafts and the open menu. Global saves preserve project precedence; project saves create overrides even unchanged. The menu never enables/disables components.

### Persistence

Global defaults live in `getAgentDir()/settings.json` (normally `~/.pi/agent/settings.json`, honoring `PI_CODING_AGENT_DIR`). Trusted project overrides live in `<cwd>/.pi/settings.json`, using Pi's configured directory name.

```json
{
  "workingMessage": {
    "order": ["pi-todo.activity", "another-extension.status"]
  }
}
```

A project `order` replaces the global array. An empty array uses sorted ID order. Removing the project `order` field restores inheritance. Unknown IDs remain in the menu as unavailable, so their positions survive temporary contributor removal. Orders support up to 1,000 nonempty IDs of at most 200 characters. Duplicates are removed, keeping the first occurrence.

Settings load at session start/menu opening. Invalid project orders warn and fall back globally; invalid global orders warn and use sorted IDs unless a valid project override applies. Order applies at session start/successful save, not menu opening.

Saves acquire Pi's settings-file lock, merge into the latest JSON, and atomically replace the file. They preserve unrelated fields and existing symlinks, reformat the JSON, and create missing parent directories. Malformed destination settings and dangling symlinks cause saves to fail. Registrations alone do not write files. There are no network requests.

## Caller responsibilities

Register once during the extension factory, before installing handlers that publish text. Use a globally unique, stable ID such as `extension-name.component-name`. IDs must match `^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$` and contain at most 200 characters. Labels and contributor names must be nonempty after trimming and contain at most 200 characters. Invalid or duplicate registrations throw.

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

Use the [library checks](../../README.md#validation). Tests cover [composition and handle ownership](coordinator.test.ts), [shared registration and runtime cleanup](index.test.ts), and [settings persistence](settings.test.ts). Draft and input tests belong to the [order-settings component](../tui/components/order-settings/README.md#validation). Use the [pi-todo offline fixture](../../../extensions/pi-todo/README.md#working-message-fixture) for real Pi checks in regular and fullscreen modes.
