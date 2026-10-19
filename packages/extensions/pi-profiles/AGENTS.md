# [pi-profiles](README.md) development

Keep [src/index.ts](src/index.ts) a thin Pi adapter. Selection reads, tool resolution, and deferral live in [src/selection.ts](src/selection.ts), which needs no Pi host. The `/profile` menu lives in [src/menu.ts](src/menu.ts), which loads on first use; the adapter gives it a snapshot of the profiles and tools.

## Must not regress

- Read project settings only when `ctx.isProjectTrusted()` is true. Profiles select tools and system prompt text, so an untrusted project must never supply or change them. See [configuration](README.md#configuration) for the merge rules.
- Read settings only on session start. Register the extension's `tool_search` on every load without reading settings, because a loading extension gets no trust decision, so it cannot tell whether a project profile defers tools.
- Add prompts only through the [prompt part](../../libs/src/prompt-parts/README.md) at rank `200`, which appends to `systemPromptOptions.appendSystemPrompt` and keeps the text that Pi and earlier handlers put there. Hold each switch, so that every part, such as pi-model-prompt's, sees the profile and its model.
- Apply `--profile` in every mode, and `defaultProfile` only in the interactive TUI. Print, JSON, and RPC runs, such as subagents, rely on their CLI flags.
- Refuse switches while the agent runs. Extension commands and shortcuts run during streaming.

## Constraints

- Restore only what Pi doesn't. On resume and `/fork`, Pi restores the model, the thinking level, and the recorded tools; on `/tree`, only the tools; on `/reload`, none, and it turns on default-active `direct` and `model-only` extension tools again. The extension declares a selection's tools when no request follows the selection: no system message and no response. Pi can omit the system message when a request changes neither the tools nor the prompt. On `/reload`, it turns off again only what the selection turned off and no later request declared. Pi loads the module again on `/reload`, and the extension keeps no state outside the session, so it cannot see the tools from before `/reload`. A compaction checkpoint copies an earlier record, so it does not count. When a tree destination has neither a selection nor recorded tools, undo the outgoing profile's tool changes. Set restored tools only when they change, because a call that turns off a tool drops Pi's pending tools.
- Undo only the previous profile's own additions and removals, so that tool changes made after a switch stay. The exception is `deny`: its tools stay off for the whole selection, also when another extension, `tool_search`, or `--tools` turns them on. Turn them off in `before_agent_start` after the switch, and in `turn_end`, because Pi takes the tools of a run's later requests before `turn_start`. Do not enforce `allow`.
- With the `deny` tools, put the active tools in a fixed order: Pi's own tools in Pi's order, then the other tools by name, so that the order does not depend on the load order. Set them only when they change.
- Let a request, tree navigation, session replacement, or the end of a session wait for a switch in progress, and refuse a second switch, because the switch awaits the model change. Save the selection before tree navigation moves to another branch or a same-file resume reads the session.
- Apply the startup selection, `--profile`, and the default profile only in the [lifecycle](../../libs/src/lifecycle/README.md) startup commit at rank `200`, so the selection entry follows pi-nested-instructions' startup messages in every load order. Keep settings reads, warnings, the shortcut claim, and the editor label in the startup handler. `/tree` restoration stays in `session_tree`.
- Claim the shortcut through the lifecycle, not `pi.registerShortcut()`. Keep the shutdown revoke synchronous: it only refuses new switches and closes the menu. Its cleanup waits for the switch in progress.
- Turn off a `defer` tool only when a declared `tool_search` can load it again: Pi's loads `codemode` and `deferred` tools, and only the extension's own copy loads `direct` and `model-only` tools. When the extension does not own `tool_search`, restoration declares a selection's deferred `direct` and `model-only` tools again. When no registered, non-hidden `tool_search` is active, restoration declares all registered, non-hidden deferred tools again.
- Treat a `defer` group that matches one tool as a single tool. Defer a group of two or more tools only as a whole, and only when the extension's `tool_search` can load it together; else declare all its tools, also on restoration. A tool belongs to the first `defer` entry that matches it.
- Match `*` patterns as Pi's `--tools` does (`toolPatternRegExp` in Pi's `core/mcp-servers.js`, which Pi does not export). As `--tools` does, let an `allow` pattern turn on only `direct` and `model-only` tools, so that `codemode` exposure stays; it keeps the base tools that it matches.
- Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`; change only the tool list that it sees, and add the rest of a deferred group to the tools that it turns on. Leave the selection's `deny` tools out of the list. Without deferred or `deny` tools, the list must equal Pi's, because the copy replaces Pi's built-in `tool_search` also for users who defer nothing.
- Keep the README's [MCP tools](README.md#mcp-tools) tables in step with tool resolution and with Pi's MCP support.
- The menu only shows state. It switches through the same path as `/profile <name>`, after it closes, so it cannot change tools in a different way.
- Keep the editor that Pi or an earlier extension set, and draw the profile name only over plain top border, so that the border's own text stays.
- Old sessions keep their selection entries. Entries that fail the schema are skipped, so a schema change loses those selections without an error.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
