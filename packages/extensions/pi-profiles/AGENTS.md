# [pi-profiles](README.md) development

Keep [src/index.ts](src/index.ts) a thin Pi adapter. Selection reads, tool resolution, and deferral live in [src/selection.ts](src/selection.ts), which needs no Pi host. The `/profile` menu lives in [src/menu.ts](src/menu.ts), which loads on first use; the adapter gives it a snapshot of the profiles and tools.

## Must not regress

- Read project settings only when `ctx.isProjectTrusted()` is true. Profiles select tools and system prompt text, so an untrusted project must never supply or change them. See [configuration](README.md#configuration) for the merge rules.
- Read settings only on session start.
- Register the extension's `tool_search` on every load without reading settings. [Pi compatibility](docs/pi-compatibility.md#limitations) gives the reason.
- Add prompts only through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `200`, which appends to `systemPromptOptions.appendSystemPrompt` and keeps the text that Pi and earlier handlers put there.
- Hold each switch, so that every part, such as pi-model-prompt's, sees the profile and its model.
- Apply `--profile` in every mode, and `defaultProfile` only in the interactive TUI. Print, JSON, and RPC runs, such as subagents, rely on their CLI flags.
- Refuse switches while the agent runs. Extension commands and shortcuts run during streaming.

## Constraints

### Startup and shutdown

- Apply the startup selection, `--profile`, and the default profile only in the [lifecycle](../../libs/src/lifecycle/README.md) startup commit at rank `200`, so the selection entry follows pi-nested-instructions' startup messages in every load order.
- Keep settings reads, warnings, the shortcut claim, and the editor label in the startup handler.
- Claim the shortcut through the lifecycle, not `pi.registerShortcut()`.
- Keep the shutdown revoke synchronous: it only refuses new switches and closes the menu. Its cleanup waits for the switch in progress.
- Old sessions keep their selection entries. The extension skips entries that fail the schema, so a schema change loses those selections without an error.

### Switching

- Let a request, tree navigation, session replacement, or the end of a session wait for a switch in progress. The switch awaits the model change.
- Refuse a second switch while a switch is in progress.
- Save the selection before tree navigation moves to another branch or a same-file resume reads the session.
- Undo only the previous profile's own additions and removals, so that tool changes made after a switch stay.
- Keep the `deny` tools off for the whole selection, also when another extension, `tool_search`, or `--tools` turns them on.
- Turn the `deny` tools off in `before_agent_start` after the switch, and in `turn_end`. [Pi compatibility](docs/pi-compatibility.md#switching) says when Pi takes the tools of a run's later requests.
- Do not enforce `allow`.
- With the `deny` tools, put the active tools in a fixed order: Pi's own tools in Pi's order, then the other tools by name, so that the order does not depend on the load order.
- Set the ordered tools only when they change.
- The menu only shows state. It switches through the same path as `/profile <name>`, after it closes, so it cannot change tools in a different way.

### Tool resolution

- Match `*` patterns as Pi's `--tools` does (`toolPatternRegExp` in Pi's `core/mcp-servers.js`, which Pi does not export).
- Let an `allow` pattern turn on only `direct` and `model-only` tools, as `--tools` does, so that `codemode` exposure stays. An `allow` pattern keeps the base tools that it matches.
- Turn off a `defer` tool only when a declared `tool_search` can load it again. Pi's `tool_search` loads `codemode` and `deferred` tools, and only the extension's own copy loads `direct` and `model-only` tools.
- Treat a `defer` group that matches one tool as a single tool.
- Defer a group of two or more tools only as a whole, and only when the extension's `tool_search` can load it together. Otherwise declare all its tools, also on restoration.
- A tool belongs to the first `defer` entry that matches it.
- Keep the [MCP tools](docs/tools.md#mcp-tools) tables in step with tool resolution and with Pi's MCP support.

### Tool search

- Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`. Change only the tool list that it sees.
- Add the rest of a deferred group to the tools that the extension's `tool_search` turns on.
- Leave the selection's `deny` tools out of the list.
- Without deferred or `deny` tools, the list must equal Pi's, because the copy replaces Pi's built-in `tool_search` also for users who defer nothing.

### Restoration

Restore only what Pi doesn't. [Pi compatibility](docs/pi-compatibility.md#restoration) lists what Pi restores on resume, `/fork`, `/tree`, and `/reload`.

- Declare a selection's tools when no request follows the selection: no system message and no response. Pi can omit the system message when a request changes neither the tools nor the prompt.
- Do not count a compaction checkpoint as a request. It copies an earlier record.
- On `/reload`, turn off again only what the selection turned off and no later request declared. Pi loads the module again on `/reload`, and the extension keeps no state outside the session, so it cannot see the tools from before `/reload`.
- When a tree destination has neither a selection nor recorded tools, undo the outgoing profile's tool changes.
- Set restored tools only when they change. A call that turns off a tool drops Pi's pending tools.
- When the extension does not own `tool_search`, declare a selection's deferred `direct` and `model-only` tools again.
- When no registered, non-hidden `tool_search` is active, declare all registered, non-hidden deferred tools again.
- Keep `/tree` restoration in `session_tree`.

### Editor

- Keep the editor that Pi or an earlier extension set.
- Draw the profile name only over plain top border, so that the border's own text stays.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
