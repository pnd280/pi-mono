# Pi compatibility for maintainers

[pi-profiles](../README.md)

> Last verified against Pi 1.4.0 with the offline host tests and a source review of the 1.3.0 to 1.4.0 changes. Not covered: isolated CLI loading, live providers, MCP servers, and a live interactive terminal session.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host suite runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

### Switching

The [adapter](../src/index.ts) relies on these contracts.

- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs.
- [ ] `ctx.modelRegistry.hasConfiguredAuth()` and `pi.setModel()` report a provider without configured credentials.
- [ ] `pi.setModel()` checks the credentials again (`checkAuth()`) and throws before it changes the model.
- [ ] Neither credentials check runs a key command or refreshes a login.
- [ ] Pi awaits `before_agent_start` handlers before it reads the model and the active tools for a request (`_prepareRun()` in `agent-session.js`).
- [ ] Pi awaits `session_before_tree` handlers before it moves the branch leaf.
- [ ] Pi awaits `session_before_switch` handlers before it reads the destination session file.
- [ ] Pi awaits `session_shutdown` handlers before it ends a session.
- [ ] `pi.setModel()` applies the thinking level that settings set for the model, or the default level, or else keeps the current level.
- [ ] `pi.setActiveTools()` ignores unknown and `hidden` names.
- [ ] `pi.getActiveTools()` returns the declared tools.
- [ ] After the `before_agent_start` handlers, the active tools decide the run's first request unless a handler edits `systemPromptOptions.selectedTools` (`_prepareRun()` in `agent-session.js`).
- [ ] Pi declares the first request's tools before `agent_start` (`runAgentLoop()` in pi-agent-core's `agent-loop.js`).
- [ ] Pi takes the tools of a run's later request in `prepareNextTurnWithContext()` (`agent-session.js`), after the `turn_end` handlers (`finishTurn`) and before `turn_start`.
- [ ] A request declares only the tools of the transcript's system messages (`streamAssistantResponse()` in `agent-loop.js`), so a `turn_start` change reaches only the request after.
- [ ] `pi.getAllTools()` lists Pi's own tools first, in Pi's order, with the source path `builtin:<name>`.
- [ ] The tools of built-in extensions have the extension's path, such as `builtin:mcp`, and only the `codemode` tool has its own name in that path.
- [ ] With a `--tools` list, a tool registration turns on again every listed tool that can be declared (`_refreshToolRegistry()` in `agent-session.js`).
- [ ] `pi.getAllTools()` reports each tool's `exposure`.
- [ ] Tools with `codemode` or `deferred` exposure stay reachable through `tool_search` and codemode while undeclared.
- [ ] Extension commands and shortcuts still run while the agent streams, and `ctx.isIdle()` is `false` then.
- [ ] `ctx.mode` is `"tui"` only in the interactive terminal.

Each awaited handler lets the extension wait for a switch in progress. The extension sets the profile's thinking level after the model, because `pi.setModel()` changes the level. It enforces `deny` and the tool order in `turn_end`, because a `turn_start` change comes too late for the next request. The `builtin:codemode` path makes `codemode` count as Pi's own tool, so it follows the core tools in the fixed order. After a `--tools` registration, the extension turns off the `deny` tools again.

### Tool search

The [adapter](../src/index.ts) builds the extension's `tool_search` from Pi's code.

- [ ] `createToolSearchExtension()` registers `tool_search` with the `pi` object that it receives as the tool's source of `getAllTools()`, `getActiveTools()`, and `setActiveTools()`.
- [ ] Pi's `tool_search` searches only inactive tools with `codemode` or `deferred` exposure.
- [ ] The `ExtensionAPI` object holds plain functions that do not use `this`, so a spread copy with three methods replaced works.
- [ ] `tool_search` turns on its matches with one `setActiveTools()` call that keeps the active tools (`searchAndLoad` in `extensions/tool-search/tool.js`).
- [ ] The `tool_search` result names only the matches.
- [ ] `createToolSearchExtension()` builds the same tool as the built-in `tool-search` extension.
- [ ] An extension that registers `tool_search` while loading stops the built-in `tool-search` extension from loading.
- [ ] `-builtin:tool-search` in `extensions` disables the built-in `tool-search` extension.
- [ ] `pi.getAllTools()` returns each tool's `reachesTools` function as registered.
- [ ] `pi.setActiveTools()` turns on registered `direct` and `model-only` tools.
- [ ] The MCP extension activates a replacement `tool_search` that declares `reachesTools`.
- [ ] With `codemode.mode` set to `"only"`, Pi hides the declarations of active `direct` tools and lists them in the codemode description (`prepareCodemodeLoadout` in `extensions/codemode/tool.js`).

The extension adds the rest of a deferred group in the same `setActiveTools()` call. If `createToolSearchExtension()` builds a different tool, the copy changes the search for users who defer no tools. The extension recognises its own `tool_search` by `reachesTools`. The [codemode-only mode](tools.md#codemode-only-mode) section describes what users see.

### Patterns

The [selection](../src/selection.ts) module relies on these contracts.

- [ ] In `--tools`, `--exclude-tools`, and `toolExposure`, `*` matches any characters, and other characters match only themselves (`toolPatternRegExp` in `core/mcp-servers.js`).
- [ ] Pi does not export `createToolNameMatcher`.
- [ ] A `--tools` pattern turns on only the `direct` and `model-only` tools that it matches (`_isDeclarable` in `agent-session.js`).

The extension has its own copy of the matcher. If Pi exports it, use it. An `allow` pattern turns on the same tools as a `--tools` pattern.

### MCP tools

Recheck each row of the [MCP tools](tools.md#mcp-tools) tables against these contracts.

- [ ] Pi names MCP tools `mcp__<server>__<tool>`, replaces other characters with `_`, and shortens long or taken names with a hash (`createMcpToolName` in `mcp/tools.js`).
- [ ] `hidden` exposure makes a tool unreachable.
- [ ] Registering a `direct` or `model-only` tool without `defaultActive: false` declares it, whatever the active tools are (`_isActivatedOnRegistration` in `agent-session.js`).
- [ ] `tool_search` declares undeclared `codemode` and `deferred` tools, including tools that a profile removed.
- [ ] Codemode scripts call undeclared `codemode` and `deferred` tools.
- [ ] The built-in MCP extension declares `codemode` and `tool_search` again when a session starts, when the server list changes, after a sign-in, and after `/mcp` actions such as reconnect (`ensureDiscoveryActive`).
- [ ] The built-in MCP extension does not declare `codemode` and `tool_search` again when a server connects by itself.
- [ ] `autoEnableCodemode: false` stops only `codemode` from being declared again.
- [ ] Pi restores tools whose server has not connected as pending, and declares pending tools when they register.
- [ ] `setActiveToolsByName()` drops the pending tools when it removes a tool (`_pendingToolNames`).

### Prompt and lifecycle coordinators

The extension adds its prompt part at rank `200` and holds each switch. The libs [prompt-parts](../../../libs/src/prompt-parts/README.md) coordinator owns the `before_agent_start` append checks. The libs [lifecycle](../../../libs/src/lifecycle/README.md) coordinator owns the checks of the startup commit, the shortcut claim, and the shutdown revoke.

### Restoration

The [selection](../src/selection.ts) module relies on these contracts.

- [ ] Pi restores tools from the transcript before `session_start` and before `session_tree`, so a later `pi.setActiveTools()` call in those handlers is kept.
- [ ] When the destination branch has no system message, Pi leaves the current tools unchanged.
- [ ] On resume, `/fork`, and `/tree`, Pi replays every system message of the branch, also before a compaction. It also turns on the registered `direct` and `model-only` extension tools that no system message adds or removes, unless they set `defaultActive: false` (`_restoreToolsFromTranscript` in `agent-session.js`).
- [ ] When a session is created, Pi restores the tools only for sessions that use `defaultTools` (`usesDefaultTools` in `sdk.js`).
- [ ] `/tree` restores the tools in every session.
- [ ] On `/reload`, Pi keeps the active tools and adds new `defaultTools` entries.
- [ ] On `/reload`, Pi restores neither the model nor the thinking level from the branch.
- [ ] On `/reload`, Pi turns on again the `direct` and `model-only` extension tools without `defaultActive: false` (`includeAllExtensionTools` in `reload()`).
- [ ] `setActiveToolsByName()` drops all pending tools when a call turns off a tool.
- [ ] Pi records tool changes in a system message before the request that first uses them (`agent-loop.js` in pi-agent-core, `agent-session.js`).
- [ ] Pi can omit the system message when neither the tools nor the prompt changed.
- [ ] A compaction checkpoint copies the latest system message (`appendCompaction` in `session-manager.js`).
- [ ] `/tree` restores only the tools, not the model or the thinking level (`navigateTree` in `agent-session.js`).
- [ ] Tool results in the branch carry `toolName`.
- [ ] Nested calls from codemode scripts do not appear as tool results.
- [ ] On resume and `/fork`, Pi restores the model and thinking level from `model_change` and `thinking_level_change` entries, which `setModel()` and `setThinkingLevel()` append.
- [ ] `pi.appendEntry()` entries appear in `getBranch()` as `custom` entries and are not sent to the model.

When the destination branch has neither a selection nor a system message, the extension undoes the outgoing selection's changes. The host tests set `defaultTools: []` instead of `noTools`, so that Pi restores the tools. After `/reload`, the extension turns off again the tools that the selection turned off, unless the last request declared them (`getCurrentSystemMessage()`). After resume, `/fork`, and `/tree`, the extension turns off again the tools that the selection knew and the last request did not declare, because Pi turns on extension tools that the branch never recorded. The extension sets restored tools only when they change, so that Pi keeps its pending tools. It counts a later system or assistant message as a request, so a switch with no request after it is not recorded. A compaction checkpoint does not record a switch.

### Lifecycle

- [ ] Pi's file-based extension loader loads the package entry point and its runtime imports.
- [ ] `session_start` fires on startup, `/reload`, `/new`, `/resume`, and `/fork`.
- [ ] `getAgentDir()` honours `PI_CODING_AGENT_DIR`.
- [ ] In `session_start`, `ctx.isProjectTrusted()` reports Pi's trust decision.
- [ ] In `session_start`, `ctx.cwd` is the directory whose `.pi/settings.json` Pi reads as project settings.
- [ ] The first session of a run has the reason `"startup"`, also with `--continue`, `--resume`, `--session`, and `--fork` (`createRuntime` in `main.js`).
- [ ] `pi.getFlag()` returns the `--profile` value in `session_start` of every session in the run, also after `/new` and `/reload` (`extensionFlagValues` in `main.js`, `flagValues` in `reload()`).
- [ ] `pi --help` lists the `--profile` option.
- [ ] `ctx.hasUI` is `false` in print and JSON modes, where `ctx.ui.notify()` does nothing.
- [ ] No built-in Pi action uses **Alt+I**, the default shortcut.

The startup tests use the file-based loader; direct factory imports do not check its module aliases. Without a UI, the extension writes errors to stderr.

### Menu

The [menu](../src/menu.ts) relies on these contracts. The libs package owns the Pi checks of the shared [browser host](../../../libs/src/tui/open-browser/README.md).

- [ ] `session_shutdown` fires before a session ends or is replaced, so an open menu closes without a switch.
- [ ] `pi.getAllTools()` returns each tool's `description` and `sourceInfo.path`.
- [ ] `pi.getActiveTools()` returns only registered tools.

### Editor

The [adapter](../src/index.ts) and the [label](../src/editor-label.ts) rely on these contracts.

- [ ] Pi clears the editor factory before `session_start`.
- [ ] `ctx.ui.getEditorComponent()` returns the factory of an earlier extension.
- [ ] `ctx.ui.setEditorComponent()` calls the factory at once, and copies Pi's handlers, border colour, and padding to the editor that it returns (`setCustomEditorComponent` in `interactive-mode.js`).
- [ ] Pi's default editor is a `CustomEditor` with `embedWorkingStatus: true`.
- [ ] The first line of `Editor.render()` is the top border, drawn with `─` and `borderColor`.

A new `CustomEditor` with `embedWorkingStatus: true` draws the working status in its top border as Pi does.

## Limitations

- Pi 1.3.0 and 1.4.0 have no event for tool registration, so the extension cannot apply a profile again when an MCP server's tools appear. `mcp_servers_change` is not a substitute: it fires only when extensions register or unregister server configurations, not when a server connects. A handler for it also stops Pi's reports of registered servers that nothing connects (`reportUnhandledMcpServers` in `runner.js`). If Pi adds a tool-registration event, consider applying the profile to tools that appear after a switch.
- In Pi 1.3.0 and 1.4.0, a loading extension gets no trust decision. `getSettings` throws in `loader.js`, and `loadProjectTrustExtensions()` loads global and CLI extensions before the trust resolver runs. So the extension registers `tool_search` on every load, because it cannot tell whether a project profile defers tools. Pi warns when it replaces the enabled built-in `tool-search`; the README's [tool search](../README.md#tool-search) section tells how to stop the warning. If Pi gives extension factories the trust decision, consider registering `tool_search` only when a global or trusted project profile has a `defer` list.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
