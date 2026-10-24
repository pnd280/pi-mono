# [pi-profiles](README.md) development

Keep [src/index.ts](src/index.ts) a thin Pi adapter. Selection reads, tool resolution, and deferral live in [src/selection.ts](src/selection.ts), which needs no Pi host. The `/profile` menu lives in [src/menu.ts](src/menu.ts), which loads on first use; the adapter gives it a snapshot of the profiles and tools. The menu only shows state: it switches through the same path as `/profile <name>`, after it closes, so it cannot change tools in a different way.

## Must not regress

- Read project settings only when `ctx.isProjectTrusted()` is true. Profiles select tools and system prompt text, so an untrusted project must never supply or change them. See [where settings apply](docs/configuration.md#where-settings-apply) for the merge rules.
- Read settings only on session start.
- Register the extension's `tool_search` on every load without reading settings. [Pi compatibility](docs/pi-compatibility.md#limitations) gives the reason.
- Add prompts only through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `200`, which appends to `systemPromptOptions.appendSystemPrompt` and keeps the text that Pi and earlier handlers put there.
- Hold each switch, so that every part, such as pi-model-prompt's, sees the profile and its model.
- Apply `--profile` in every mode, and `defaultProfile` only in the interactive TUI. Print, JSON, and RPC runs, such as subagents, rely on their CLI flags.
- Refuse switches while the agent runs. Extension commands and shortcuts run during streaming.

## Startup and shutdown

- Apply the startup selection, `--profile`, and the default profile only in the [lifecycle](../../libs/src/lifecycle/README.md) startup commit at rank `200`, so the selection entry follows pi-nested-instructions' startup messages in every load order.
- Keep settings reads, warnings, the shortcut claim, and the editor label in the startup handler.
- Claim the shortcut through the lifecycle, not `pi.registerShortcut()`.
- Keep the shutdown revoke synchronous: it only refuses new switches and closes the menu. Its cleanup waits for the switch in progress.
- Old sessions keep their selection entries. The extension skips entries that fail the schema, so a schema change loses those selections without an error.

## Switching

- Let a request, tree navigation, session replacement, or the end of a session wait for a switch in progress. The switch awaits the model change.
- Refuse a second switch while a switch is in progress.
- Save the selection before tree navigation moves to another branch or a same-file resume reads the session.
- Undo only the previous profile's own additions and removals, so that tool changes made after a switch stay.
- Keep the `deny` tools off for the whole selection, also when another extension, `tool_search`, or `--tools` turns them on. Apply `allow` only at the switch, so later tool changes can turn on other tools.
- Turn the `deny` tools off in `before_agent_start` after the switch, and in `turn_end`. [Pi compatibility](docs/pi-compatibility.md#switching) says when Pi takes the tools of a run's later requests.
- With the `deny` tools, put the active tools in a fixed order: Pi's own tools in Pi's order, then the other tools by name, so that the order does not depend on the load order. Set the ordered tools only when they change.

## References

| When you change…                                | Read                                                 |
| ----------------------------------------------- | ---------------------------------------------------- |
| Patterns, `defer`, or groups                    | [Tool resolution](docs/internals.md#tool-resolution) |
| The extension's `tool_search`                   | [Tool search](docs/internals.md#tool-search)         |
| Resume, `/fork`, `/tree`, or `/reload` handling | [Restoration](docs/internals.md#restoration)         |
| The editor label                                | [Editor](docs/internals.md#editor)                   |
| Tests                                           | [Testing](docs/testing.md)                           |
| The Pi version                                  | [Compatibility checklist](docs/pi-compatibility.md)  |
