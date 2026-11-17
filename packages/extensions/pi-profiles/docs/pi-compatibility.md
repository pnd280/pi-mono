# Pi compatibility for maintainers

[pi-profiles](../README.md)

> Last verified against Pi 1.5.2 with the offline host tests and a source review of the 1.5.1 to 1.5.2 changes. Not covered: the offline SDK session that checked the order of the declared tools, which last ran on Pi 1.5.0; live providers; MCP servers; a terminal session of the installed CLI; and the manual checks.

## Checklist

### Switching

The [adapter](../src/index.ts) relies on these contracts.

- [ ] `ctx.modelRegistry.find()` resolves exact provider and model IDs.
- [ ] `ctx.modelRegistry.hasConfiguredAuth()` and `pi.setModel()` report a provider without configured credentials.
- [ ] `pi.setModel()` checks the credentials again (`checkAuth()`) and throws before it changes the model.
- [ ] Neither credentials check runs a key command or refreshes a login.
- [ ] Pi awaits `before_agent_start` handlers before it reads the model and the active tools for a request (`_prepareRun()` in `agent-session.js`).
- [ ] Pi awaits `session_shutdown` handlers before it ends a session.
- [ ] `pi.setModel()` applies the thinking level that settings set for the model, or the default level, or else keeps the current level.
- [ ] `pi.setActiveTools()` ignores unknown and `hidden` names.
- [ ] `pi.getActiveTools()` returns the active tools, including those whose declarations a `prepareLoadout` hook hides.
- [ ] Extension commands and shortcuts still run while the agent streams, and `ctx.isIdle()` is `false` then.
- [ ] `ctx.mode` is `"tui"` only in the interactive terminal.

Each awaited handler lets the extension wait for a switch in progress. The extension sets the profile's thinking level after the model, because `pi.setModel()` changes the level.

### Tool search

The [adapter](../src/index.ts) builds the extension's `tool_search` from Pi's code.

- [ ] Pi's `tool_search` searches only inactive tools with `codemode` or `deferred` exposure.
- [ ] The `tool_search` result names only the matches.
- [ ] `createToolSearchExtension()` builds the same tool as the built-in `tool-search` extension.
- [ ] An extension that registers `tool_search` while loading stops the built-in `tool-search` extension from loading.
- [ ] `-builtin:tool-search` in `extensions` disables the built-in `tool-search` extension.
- [ ] The MCP extension activates a replacement `tool_search` that declares `reachesTools`.
- [ ] With `codemode.mode` set to `"only"`, Pi hides the request declarations of active `direct` tools and lists those that fit `codemode.inlineBudget` in the codemode description (`prepareCodemodeLoadout` in `extensions/codemode/tool.js`).

If `createToolSearchExtension()` builds a different tool, the copy changes the search for users who defer no tools. The [codemode-only mode](tools.md#codemode-only-mode) section describes what users see.

### Patterns

The [selection](../src/selection.ts) module relies on these contracts.

- [ ] In `--tools`, `--exclude-tools`, and `toolExposure`, `*` matches any characters, and other characters match only themselves (`toolPatternRegExp` in `core/mcp-servers.js`).
- [ ] A `--tools` pattern turns on only the `direct` and `model-only` tools that it matches (`_isDeclarable` in `agent-session.js`).

### MCP tools

Recheck each row of the [MCP tools](tools.md#mcp-tools) tables against these contracts.

- [ ] Pi names MCP tools `mcp__<server>__<tool>`, replaces other characters with `_`, and shortens long or taken names with a hash (`createMcpToolName` in `naming.js` in pi-mcp).
- [ ] `hidden` exposure makes a tool unreachable.
- [ ] Codemode scripts call undeclared `codemode` and `deferred` tools.
- [ ] The built-in MCP extension declares `codemode` and `tool_search` again when a session starts, when the server list changes, after a sign-in, and after `/mcp` actions such as reconnect (`ensureDiscoveryActive`).
- [ ] The built-in MCP extension does not declare `codemode` and `tool_search` again when a server connects by itself.
- [ ] `autoEnableCodemode: false` stops only `codemode` from being declared again.
- [ ] Pi restores tools whose server has not connected as pending, and declares pending tools when they register.
- [ ] `setActiveToolsByName()` drops all pending tools when a call turns off a tool (`_pendingToolNames`).

### MCP servers

The [adapter](../src/index.ts) relies on these contracts.

- [ ] `pi.registerMcpServer()` validates the name and the entry, and throws for an invalid entry, a name that another extension registered, or a name that differs from a registered one only in `-` and `_` (`registerMcpServer` in `core/extensions/loader.js`).
- [ ] Pi loads the extension again for each session and on `/reload`, and drops the registrations of the previous load.
- [ ] A server in `mcp.json` takes precedence over a registered server whose name is the same, or differs only in `-` and `_` (`registeredServers` in `extensions/mcp/index.js`).

The [MCP servers](switching.md#mcp-servers) and [profile MCP servers](tools.md#profile-mcp-servers) sections describe what users see.

### Prompt and lifecycle coordinators

The extension adds its prompt part and holds each switch. The libs [prompt-parts](../../../libs/src/prompt-parts/README.md) coordinator owns the `before_agent_start` append checks. The libs [lifecycle](../../../libs/src/lifecycle/README.md) coordinator owns the checks of the startup commit, the shortcut claim, and the shutdown revoke.

### Restoration

The [selection](../src/selection.ts) module relies on these contracts.

- [ ] When the destination branch has no system message, Pi leaves the current tools unchanged.
- [ ] On resume, `/fork`, and `/tree`, Pi replays every system message of the branch, also before a compaction. It also turns on the registered `direct` and `model-only` extension tools that no system message adds or removes, unless they set `defaultActive: false` (`_restoreToolsFromTranscript` in `agent-session.js`).
- [ ] When a session is created, Pi restores the tools only for sessions that use `defaultTools` (`usesDefaultTools` in `sdk.js`).
- [ ] `/tree` restores the tools in every session.
- [ ] On `/reload`, Pi keeps the active tools and adds new `defaultTools` entries.
- [ ] On `/reload`, Pi restores neither the model nor the thinking level from the branch.
- [ ] On `/reload`, Pi turns on again the `direct` and `model-only` extension tools without `defaultActive: false` (`includeAllExtensionTools` in `reload()`).
- [ ] `/tree` restores only the tools, not the model or the thinking level (`navigateTree` in `agent-session.js`).
- [ ] Nested calls from codemode scripts do not appear as tool results.
- [ ] On resume and `/fork`, Pi restores the model and thinking level from `model_change` and `thinking_level_change` entries, which `setModel()` and `setThinkingLevel()` append.
- [ ] When a run starts on a branch that has a `thinking_level_change` entry whose level, clamped to the current model, differs from the current level, Pi appends an entry with the current level (`_recordThinkingLevel` in `agent-session.js`).
- [ ] `pi.appendEntry()` entries appear in `getBranch()` as `custom` entries and are not sent to the model.

The extension's restoration rules are in [internals](internals.md#restoration); what users see is in [sessions](sessions.md#restoration).

### Lifecycle

- [ ] `session_start` fires on startup, `/reload`, `/new`, `/resume`, and `/fork`.
- [ ] In `session_start`, `ctx.cwd` is the directory whose `.pi/settings.json` Pi reads as project settings.
- [ ] The first session of a run has the reason `"startup"`, also with `--continue`, `--resume`, `--session`, and `--fork` (`createRuntime` in `main.js`).
- [ ] `pi.getFlag()` returns the `--profile` value in `session_start` of every session in the run, also after `/new` and `/reload` (`extensionFlagValues` in `main.js`, `flagValues` in `reload()`).
- [ ] `pi --help` lists the `--profile` option.
- [ ] `ctx.hasUI` is `false` in print and JSON modes, where `ctx.ui.notify()` does nothing.
- [ ] No built-in Pi action uses **Alt+I**, the default shortcut.

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

- In Pi 1.5.0 to 1.5.2, `pi.setActiveTools()` keeps the current order of the tools that stay active (`_applyToolLoadout()` in `agent-session.js`), so the extension no longer orders the declared tools. Tools that stay active keep their order, and newly active tools follow the order of the requested names. Only a call that turns tools off could reorder them, and that call drops Pi's pending tools.
- Pi 1.3.0 to 1.5.2 have no event for tool registration, so the extension cannot apply a profile again when an MCP server's tools appear. `mcp_servers_change` is not a substitute: it fires only when extensions register or unregister server configurations, not when a server connects. A handler for it also stops Pi's reports of registered servers that nothing connects (`reportUnhandledMcpServers` in `runner.js`). If Pi adds a tool-registration event, consider applying the profile to tools that appear after a switch.
- In Pi 1.3.0 to 1.5.2, a loading extension gets no trust decision. `getSettings` throws in `loader.js`, and `loadProjectTrustExtensions()` loads global and CLI extensions before the trust resolver runs. So the extension registers `tool_search` on every load, because it cannot tell whether a project profile defers tools. If Pi gives extension factories the trust decision, consider registering `tool_search` only when a global or trusted project profile has a `defer` list.
- The extension uses `getAgentDir()`, not the SDK resource loader's directory override, so SDK hosts with a custom `agentDir` must set `PI_CODING_AGENT_DIR` to match.
