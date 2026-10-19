# Pi compatibility for maintainers

[pi-profiles](../README.md)

> Last verified against Pi 1.3.0 with the offline host tests, isolated CLI loading, and source inspection. Not covered: live providers, MCP servers, and a live interactive terminal session.

## Upgrade procedure

1. Run the [workspace checks](../../../../docs/development.md#focused-validation). The host suite runs the installed Pi offline.
2. Work through the checklist below, then update the "Last verified" line.

## Checklist

### Switching

[Adapter](../src/index.ts):

- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs, and `ctx.modelRegistry.hasConfiguredAuth()` and `pi.setModel()` report a provider without configured credentials. `pi.setModel()` checks the credentials again (`checkAuth()`) and throws before it changes the model. Neither check runs a key command or refreshes a login.
- [ ] Pi awaits `before_agent_start` handlers before it reads the model and the active tools for a request (`_prepareRun()` in `agent-session.js`), `session_before_tree` handlers before it moves the branch leaf, `session_before_switch` handlers before it reads the destination session file, and `session_shutdown` handlers before it ends a session, so each can wait for a switch.
- [ ] `pi.setModel()` applies the thinking level that settings set for the model, or the default level, or else keeps the current level, so the extension sets the profile's level after the model.
- [ ] `pi.setActiveTools()` ignores unknown and `hidden` names, and `pi.getActiveTools()` returns the declared tools.
- [ ] `pi.getAllTools()` reports each tool's `exposure`, and tools with `codemode` or `deferred` exposure stay reachable through `tool_search` and codemode while undeclared.
- [ ] Extension commands and shortcuts still run while the agent streams, and `ctx.isIdle()` is `false` then.
- [ ] `ctx.mode` is `"tui"` only in the interactive terminal.

### Tool search

[Adapter](../src/index.ts):

- [ ] `createToolSearchExtension()` registers `tool_search` with the `pi` object that it receives as the tool's source of `getAllTools()`, `getActiveTools()`, and `setActiveTools()`, and the tool searches only inactive tools with `codemode` or `deferred` exposure.
- [ ] The `ExtensionAPI` object holds plain functions that do not use `this`, so a spread copy with three methods replaced works.
- [ ] `tool_search` turns on its matches with one `setActiveTools()` call that keeps the active tools (`searchAndLoad` in `extensions/tool-search/tool.js`), so the extension adds the rest of a deferred group in that call. Its result names only the matches.
- [ ] `createToolSearchExtension()` still builds the same tool as the built-in `tool-search` extension, so the copy changes nothing for users who defer no tools.
- [ ] The built-in `tool-search` extension is still replaceable: an extension that registers `tool_search` while loading stops it from loading, and `-builtin:tool-search` in `extensions` disables it.
- [ ] `pi.getAllTools()` returns each tool's `reachesTools` function as registered, so the extension recognises its own `tool_search`.
- [ ] `pi.setActiveTools()` turns on registered `direct` and `model-only` tools, and the MCP extension still activates a replacement `tool_search` that declares `reachesTools`.
- [ ] With `codemode.mode` set to `"only"`, Pi still hides the declarations of active `direct` tools and lists them in the codemode description (`prepareCodemodeLoadout` in `extensions/codemode/tool.js`), as the README's [codemode-only mode](../README.md#codemode-only-mode) section says.

### Patterns

[Selection](../src/selection.ts):

- [ ] In `--tools`, `--exclude-tools`, and `toolExposure`, `*` still matches any characters, and other characters match only themselves (`toolPatternRegExp` in `core/mcp-servers.js`). Pi does not export `createToolNameMatcher`, so the extension has its own copy. If Pi exports it, use it.
- [ ] A `--tools` pattern still turns on only the `direct` and `model-only` tools that it matches (`_isDeclarable` in `agent-session.js`), so an `allow` pattern does the same.

### MCP tools

Recheck each row of the README's [MCP tools](../README.md#mcp-tools) tables:

- [ ] Pi still names MCP tools `mcp__<server>__<tool>`, replaces other characters with `_`, and shortens long or taken names with a hash (`createMcpToolName` in `mcp/tools.js`). `hidden` exposure makes a tool unreachable.
- [ ] Registering a `direct` or `model-only` tool without `defaultActive: false` still declares it (`_isActivatedOnRegistration` in `agent-session.js`), whatever the active tools are.
- [ ] `tool_search` still declares undeclared `codemode` and `deferred` tools, including tools that a profile removed, and codemode scripts still call them while undeclared.
- [ ] The built-in MCP extension still declares `codemode` and `tool_search` again when a session starts, when the server list changes, after a sign-in, and after `/mcp` actions such as reconnect, but not when a server connects by itself (`ensureDiscoveryActive`). `autoEnableCodemode: false` still stops only `codemode`.
- [ ] Pi still restores tools whose server has not connected as pending, declares pending tools when they register, and drops them when `setActiveToolsByName()` removes a tool (`_pendingToolNames`).

### Prompt

- [ ] `before_agent_start` exposes a writable `systemPromptOptions.appendSystemPrompt` with Pi's append text and earlier extensions' changes, and Pi builds new options for each run.

### Restoration

[Selection](../src/selection.ts):

- [ ] Pi restores tools from the transcript before `session_start` and before `session_tree`, so a later `pi.setActiveTools()` call in those handlers is kept. When the destination branch has no system message, Pi leaves the current tools unchanged, so the extension undoes the outgoing selection's changes if the destination also has no selection.
- [ ] When a session is created, Pi restores the tools only for sessions that use `defaultTools` (`usesDefaultTools` in `sdk.js`), so the host tests set `defaultTools: []` instead of `noTools`. `/tree` restores them in every session.
- [ ] On `/reload`, Pi keeps the active tools, adds new `defaultTools` entries, and turns on again the `direct` and `model-only` extension tools without `defaultActive: false` (`includeAllExtensionTools` in `reload()`). The extension turns off again the tools that the selection turned off, unless the last request declared them (`getCurrentSystemMessage()`).
- [ ] `setActiveToolsByName()` drops all pending tools when a call turns off a tool, so the extension sets restored tools only when they change.
- [ ] Pi records tool changes in a system message before the request that first uses them, and can omit it when neither the tools nor the prompt changed (`agent-loop.js` in pi-agent-core, `agent-session.js`). So the extension counts a later system or assistant message as a request. A switch with no request after it is not recorded. A compaction checkpoint copies the latest system message (`appendCompaction` in `session-manager.js`), so it does not record a switch.
- [ ] `/tree` restores only the tools, not the model or the thinking level (`navigateTree` in `agent-session.js`).
- [ ] Tool results in the branch carry `toolName`, and nested calls from codemode scripts do not appear as tool results.
- [ ] On resume and `/fork`, Pi restores the model and thinking level from `model_change` and `thinking_level_change` entries, which `setModel()` and `setThinkingLevel()` append.
- [ ] `pi.appendEntry()` entries appear in `getBranch()` as `custom` entries and are not sent to the model.

### Lifecycle

- [ ] Pi's file-based extension loader loads the package entry point and its runtime imports. The startup tests use this loader; direct factory imports do not check its module aliases.
- [ ] The thinking-level enum in [settings](../src/settings.ts) matches Pi's `ModelThinkingLevel` values.
- [ ] `session_start` fires on startup, `/reload`, `/new`, `/resume`, and `/fork`, and `getAgentDir()` honours `PI_CODING_AGENT_DIR`.
- [ ] In `session_start`, `ctx.isProjectTrusted()` reports Pi's trust decision, and `ctx.cwd` is the directory whose `.pi/settings.json` Pi reads as project settings.
- [ ] The first session of a run has the reason `"startup"`, also with `--continue`, `--resume`, `--session`, and `--fork` (`createRuntime` in `main.js`).
- [ ] `pi.getFlag()` returns the `--profile` value in `session_start` of every session in the run, also after `/new` and `/reload` (`extensionFlagValues` in `main.js`, `flagValues` in `reload()`), and `pi --help` lists the option.
- [ ] `ctx.hasUI` is `false` in print and JSON modes, where `ctx.ui.notify()` does nothing, so errors go to stderr.
- [ ] Interactive mode reads extension shortcuts after `session_start`, so the shortcut registered there works.
- [ ] No built-in Pi action uses **Alt+I**, the default shortcut.

### Menu

[Menu](../src/menu.ts):

- [ ] The shared [browser host](../../../libs/src/tui/open-browser/README.md) still mounts in interactive mode; the libs package owns its Pi checks.
- [ ] `session_shutdown` fires before a session ends or is replaced, so an open menu closes without a switch.
- [ ] `pi.getAllTools()` returns each tool's `description` and `sourceInfo.path`, and `pi.getActiveTools()` returns only registered tools.

### Editor

[Adapter](../src/index.ts) and [label](../src/editor-label.ts):

- [ ] Pi clears the editor factory before `session_start`, and `ctx.ui.getEditorComponent()` returns the factory of an earlier extension.
- [ ] `ctx.ui.setEditorComponent()` calls the factory at once, and copies Pi's handlers, border colour, and padding to the editor that it returns (`setCustomEditorComponent` in `interactive-mode.js`).
- [ ] Pi's default editor is a `CustomEditor` with `embedWorkingStatus: true`, so a new one draws the working status in its top border as Pi does.
- [ ] The first line of `Editor.render()` is the top border, drawn with `─` and `borderColor`.

## Limitations

- Pi 1.3.0 has no event for tool registration, so the extension cannot apply a profile again when an MCP server's tools appear. `mcp_servers_change` is not a substitute: it fires only when extensions register or unregister server configurations, not when a server connects. A handler for it also stops Pi's reports of registered servers that nothing connects (`reportUnhandledMcpServers` in `runner.js`). If Pi adds a tool-registration event, consider applying the profile to tools that appear after a switch.
- A loading extension gets no trust decision: `getSettings` throws in `loader.js`, and `loadProjectTrustExtensions()` loads global and CLI extensions before the trust resolver runs. So the extension registers `tool_search` on every load. Pi warns when it replaces the enabled built-in `tool-search`; the README's [tool search](../README.md#tool-search) section tells how to stop the warning. If Pi gives extension factories the trust decision, consider registering `tool_search` only when a global or trusted project profile has a `defer` list.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
