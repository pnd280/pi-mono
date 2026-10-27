# Working-message coordinator

[Library index](../../README.md#usage)

Pi shows one working message while the agent runs, so extensions that each set it overwrite each other. `@pi-mono/libs/working-message` combines their contributions into that message in a saved order. The first registration installs the coordinator, and at session start one participating extension registers the `/working-message` command, so no separate extension is needed.

## Behaviour

- Only interactive TUI mode receives working-message updates. RPC, JSON, and print modes do not.
- The coordinator joins nonempty contributions with `·` in the configured order. Unlisted components follow in sorted ID order.
- Empty contributions stay registered and listed in settings. When no component has text, Pi's default message returns.
- A nonempty `overrideWorkingMessage` override replaces contributions. The most recently changed nonempty override wins. Clearing it reveals the next nonempty override, or the combined message. Overrides stay out of the settings menu.
- The coordinator sanitises text for the terminal and collapses whitespace to one line. Overrides keep SGR styling, such as theme colours; contributions are plain text.
- Library copies share one coordinator through Pi's event bus, as the [coordinator protocol](../coordination/README.md) describes. Shutdown removes it and invalidates handles. New sessions and reloads register fresh components.
- Only components and overrides of live participants show, so those of a failed or left-out factory never show.
- When more than one live extension registers a component ID, none of those components shows, and one warning names the ID.
- Nonparticipants can overwrite the message without interception. The indicator's content and visibility are unchanged.
- `setText()` or `setText("")` clears only that component, and `dispose()` unregisters it. Stale or disposed handles cannot mutate replacements.
- The extension whose component has the lowest `ownerRank` hosts `/working-message`.

| When you…                                         | Read                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Choose an `ownerRank`                             | [Recommended owner ranks](command-owner.md#recommended-owner-ranks) |
| Debug why `/working-message` is missing           | [Command owner](command-owner.md#command-owner)                     |
| Check what changes when two library versions meet | [Version mismatch](command-owner.md#version-mismatch)               |
| Change the menu, its keys, or saved ordering      | [Ordering and settings](ordering.md)                                |

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
    contributor: "example",
    ownerRank: 400
  });

  pi.on("agent_start", () => activity.setText("Checking files"));
  pi.on("agent_end", () => activity.setText());
}
```

## Caller responsibilities

- Register once during the extension factory, before installing handlers that publish text.
- Pass the required `ownerRank` from the [recommended owner ranks](command-owner.md#recommended-owner-ranks).
- Use a globally unique, stable ID such as `extension-name.component-name`. The [component schema](coordinator.ts) sets the character and length limits. Invalid components, an `ownerRank` that is not a number, an ID that the extension already registered, and registration after shutdown throw.
- Register overrides in the extension factory too. Use them only for short, urgent text that must hide all contributions.
- Keep handles runtime-local. Publish restored state in `session_start` and update it on state changes. Text stays when Pi emits `session_start` again in the same runtime.
- For temporary inactivity, clear the text instead of disposing the handle, so the component stays visible in settings.

## Validation

The [settings-file tests](../settings-file/README.md#validation) cover trust and file handling. Use the [pi-todo offline fixture](../../../extensions/pi-todo/docs/validation.md#working-message-fixture) to check ordering, `/working-message`, and the published text in real Pi, in regular and fullscreen modes.
