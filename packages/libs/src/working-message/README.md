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

The selected save scope uses the accent color. `*` marks unsaved edits; `(not set)` means no valid saved order, including after editing. Explicit empty orders count as set. Only successful scope saves clear the unset marker, even when the order is unchanged.

An unset project draft inherits the saved global order; an unset global draft uses sorted IDs, never the project override. Saving global refreshes unedited inherited project drafts. Inheritance neither writes settings nor changes precedence.

| Key                    | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| Up or Down             | Select a component, stopping at boundaries             |
| Shift+Up or Shift+Down | Move the selected component                            |
| Tab or Shift+Tab       | Switch between global and project drafts               |
| Ctrl+S                 | Save the displayed scope and apply the effective order |
| Escape or Ctrl+C       | Close and discard all remaining unsaved drafts         |

These are fixed menu keys, independent of Pi's configurable browser bindings. Native transcript paging remains with Pi. Only saved drafts affect the message; failures retain drafts and selection with inline recovery, and Ctrl+S retries. Global saves preserve project precedence; project saves create overrides even unchanged. Success clears on edits or scope changes. Load warnings remain visible until settings reload successfully. The menu never enables/disables components.

Both settings editors use the [shared settings frame](../tui/components/settings-menu/README.md). At 40×10, selection, save/exit controls, and recovery take priority over paths and secondary context; resize smaller terminals for the full view.

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

Settings load at session start and when the menu opens. Invalid settings or failures from the [settings-file reader](../settings-file/README.md#behavior) produce terminal-safe warnings and fall back to the other valid scope or sorted IDs. Diagnostic sanitization does not change settings paths. Order applies at session start or after a successful save, not when the menu opens.

Saves acquire Pi's settings-file lock, merge into the latest JSON, and atomically replace the file. They preserve unrelated fields and existing symlinks, reformat the JSON, and create missing parent directories.

An explicit save can replace an invalid `order` in an otherwise valid `workingMessage` object while preserving its other fields. Saves fail without replacing the destination if the file or section is malformed, the file cannot be read, a symlink is dangling, or the formatted result exceeds the reader's size limit. Registrations alone do not write files. There are no network requests.

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

Use the [library checks](../../README.md#validation). Tests cover [composition and handle ownership](coordinator.test.ts), [shared registration and runtime cleanup](index.test.ts), [settings persistence](settings.test.ts), and [command integration](command.test.ts). Command tests use the [shared interactive host fixture](../validation/interactive-host/README.md) with only working-message contributors; no widget extension is loaded. Draft and input tests belong to the [order-settings component](../tui/components/order-settings/README.md#validation). Use the [pi-todo offline fixture](../../../extensions/pi-todo/docs/validation.md#working-message-fixture) for real Pi checks in regular and fullscreen modes.
