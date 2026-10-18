# [pi-profiles](README.md) development

Keep [src/index.ts](src/index.ts) a thin Pi adapter. Selection reads, tool resolution, and deferral live in [src/selection.ts](src/selection.ts), which needs no Pi host. The `/profile` menu lives in [src/menu.ts](src/menu.ts), which loads on first use; the adapter gives it a snapshot of the profiles and tools.

## Must not regress

- Read project settings only when `ctx.isProjectTrusted()` is true. Profiles select tools and system prompt text, so an untrusted project must never supply or change them. See [configuration](README.md#configuration) for the merge rules.
- Read settings only on session start. Register the extension's `tool_search` on every load without reading settings, because a loading extension gets no trust decision, so it cannot tell whether a project profile defers tools.
- Add prompts only to `systemPromptOptions.appendSystemPrompt`, and keep the text that Pi and earlier extensions put there.
- Apply `--profile` in every mode, and `defaultProfile` only in the interactive TUI. Print, JSON, and RPC runs, such as subagents, rely on their CLI flags.
- Refuse switches while the agent runs. Extension commands and shortcuts run during streaming.

## Constraints

- Restore only what Pi doesn't. On resume and `/fork`, Pi restores the model, the thinking level, and the recorded tools; on `/tree`, only the tools; on `/reload`, none, and it turns on default-active `direct` and `model-only` extension tools again. The extension declares a selection's tools when no request follows the selection: no system message and no response. Pi can omit the system message when a request changes neither the tools nor the prompt. On `/reload`, it turns off again only what the selection turned off and no later request declared. Pi loads the module again on `/reload`, and the extension keeps no state outside the session, so it cannot see the tools from before `/reload`. A compaction checkpoint copies an earlier record, so it does not count. Set restored tools only when they change, because a call that turns off a tool drops Pi's pending tools.
- Undo only the previous profile's own additions and removals, so that tool changes made after a switch stay.
- Let a request or the end of a session wait for a switch in progress, and refuse a second switch, because the switch awaits the model change.
- Turn off a `defer` tool only when a declared `tool_search` can load it again: Pi's loads `codemode` and `deferred` tools, and only the extension's own copy loads `direct` and `model-only` tools. When the extension does not own `tool_search`, restoration declares a selection's deferred `direct` and `model-only` tools again.
- Treat a `defer` group that matches one tool as a single tool. Defer a group of two or more tools only as a whole, and only when the extension's `tool_search` can load it together; else declare all its tools, also on restoration. A tool belongs to the first `defer` entry that matches it.
- Match `*` patterns as Pi's `--tools` does (`toolPatternRegExp` in Pi's `core/mcp-servers.js`, which Pi does not export).
- Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`; change only the tool list that it sees, and add the rest of a deferred group to the tools that it turns on. Without deferred tools, the list must equal Pi's, because the copy replaces Pi's built-in `tool_search` also for users who defer nothing.
- Keep the README's [MCP tools](README.md#mcp-tools) tables in step with tool resolution and with Pi's MCP support.
- The menu only shows state. It switches through the same path as `/profile <name>`, after it closes, so it cannot change tools in a different way.
- Keep the editor that Pi or an earlier extension set, and draw the profile name only over plain top border, so that the border's own text stays.
- Old sessions keep their selection entries. Entries that fail the schema are skipped, so a schema change loses those selections without an error.

## Validation

[Testing](docs/testing.md) lists the offline coverage. For Pi upgrades, follow the [compatibility checklist](docs/pi-compatibility.md).
