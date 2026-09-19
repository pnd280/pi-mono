# Working-message coordinator

[Library index](../../README.md#usage)

Use `@pi-mono/libs/working-message` to combine contributions from multiple extensions in Pi's working message. The first registration installs the coordinator and `/working-message` command. No separate extension is required.

## Behavior

- Nonempty contributions are joined with `·` in the configured order. Unlisted components follow in sorted ID order.
- Components with empty text are inactive but remain registered and visible in settings. With no active text, Pi's default working message is restored.
- The coordinator sanitizes contribution text for terminal display and collapses whitespace to a single line. The settings list shows component labels and contributors in the primary column, with current text, `inactive`, or `unavailable` in the secondary column.
- Registrations share one owner through Pi's event bus, including separately loaded library instances. Shutdown removes the owner and invalidates old handles. New sessions and reloads register fresh components.
- Nonparticipating extensions can still overwrite Pi's working message. Their writes are not intercepted. The coordinator does not change the working indicator or its visibility.

### Settings menu

`/working-message` requires interactive TUI mode. It opens the project scope when an override exists, otherwise the global scope. `/working-message global` and `/working-message project` select a scope explicitly. Project scope requires a trusted project.

| Key                    | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| Up or Down             | Select a component                                     |
| Shift+Up or Shift+Down | Move the selected component                            |
| Tab or Shift+Tab       | Switch between global and project drafts               |
| Ctrl+S                 | Save the displayed scope and apply the effective order |
| Escape or Ctrl+C       | Close and discard all remaining unsaved drafts         |

The menu displays the save destination, inactive and unavailable components, unsaved changes, and save errors. Narrow widths prioritize component labels over the secondary column. At constrained terminal heights, it omits the destination to preserve the indented title, scope, component list, and controls. Drafts do not change the working message until saved. Failed saves leave the draft intact and the menu open. Saving global defaults leaves any project override active. Saving the project draft creates an override even if the order is unchanged. The menu does not enable or disable components.

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

Settings load at session start and when the menu opens. Loading an invalid project order produces a warning and falls back to the global order. An invalid global order falls back to sorted ID order with a warning, unless a valid project override applies. The effective order is applied at session start or after a successful save, not merely by opening the menu.

Saves acquire Pi's settings-file lock, merge into the latest JSON, and atomically replace the file. They preserve unrelated fields and existing symlinks, reformat the JSON, and create missing parent directories. Malformed destination settings and dangling symlinks cause saves to fail. Registrations alone do not write files. There are no network requests.

## Caller responsibilities

Register once during the extension factory, before installing handlers that publish text. Use a globally unique, stable ID such as `extension-name.component-name`. IDs must match `^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$` and contain at most 200 characters. Labels and contributor names must be nonempty after trimming and contain at most 200 characters. Invalid or duplicate registrations throw.

Keep handles within the extension runtime. The coordinator clears text at session start. Publish restored session state from your `session_start` handler and update the text when the contributor's state changes.

`setText()` or `setText("")` clears only that component. `dispose()` unregisters it. Stale or disposed handles cannot mutate a replacement. For temporary inactivity, clear the text to keep the component available in settings.

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
