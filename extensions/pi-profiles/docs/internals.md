# Profiles internals for maintainers

[pi-profiles](../README.md)

This reference is for maintainers who change how a selection resolves, searches, or restores tools, or how the editor shows the profile name. The [user guide on tools](tools.md) describes what users see, and the [compatibility checklist](pi-compatibility.md) lists the Pi contracts that these rules rely on.

## Tool resolution

The [selection](../src/selection.ts) module owns tool resolution, deferral, restoration, and the `deny` enforcement. Each entry point returns a full decision. The switch and the menu's change preview use the same plan, `planSwitch`.

- Match `*` patterns as Pi's `--tools` does (`toolPatternRegExp` in Pi's `core/mcp-servers.js`, which Pi does not export).
- Let an `allow` pattern turn on only `direct` and `model-only` tools, as `--tools` does, so that `codemode` exposure stays. An `allow` pattern keeps the base tools that it matches.
- Turn off a `defer` tool only when a declared `tool_search` can load it again. Pi's `tool_search` loads `codemode` and `deferred` tools, and only the extension's own copy loads `direct` and `model-only` tools.
- Treat a `defer` group that matches one tool as a single tool.
- Defer a group of two or more tools only as a whole, and only when the extension's `tool_search` can load it together. Otherwise declare all its tools, also on restoration.
- A tool belongs to the first `defer` entry that matches it.
- Keep the [MCP tools](tools.md#mcp-tools) tables in step with tool resolution and with Pi's MCP support.

## Tool search

- Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`. Change only the tool list that it sees.
- Add the rest of a deferred group to the tools that the extension's `tool_search` turns on.
- Leave the selection's `deny` tools out of the list.
- Without deferred or `deny` tools, the list must equal Pi's, because the copy replaces Pi's built-in `tool_search` also for users who defer nothing.

## Restoration

Restore only what Pi doesn't. [Pi compatibility](pi-compatibility.md#restoration) lists what Pi restores on resume, `/fork`, `/tree`, and `/reload`.

- Declare a selection's tools when no request follows the selection: no system message and no response. Pi can omit the system message when a request changes neither the tools nor the prompt. A compaction checkpoint copies an earlier record, so it does not count as a request.
- On `/reload`, turn off again only what the selection turned off and no later request declared. Pi loads the module again on `/reload`, and the extension keeps no state outside the session, so it cannot see the tools from before `/reload`.
- When a tree destination has neither a selection nor recorded tools, undo the outgoing profile's tool changes.
- Set restored tools only when they change. A call that turns off a tool drops Pi's pending tools.
- When the extension does not own `tool_search`, declare a selection's deferred `direct` and `model-only` tools again.
- When no registered, non-hidden `tool_search` is active, declare all registered, non-hidden deferred tools again.
- Keep `/tree` restoration in `session_tree`.

## Editor

The [label](../src/editor-label.ts) draws the profile name in the editor border.

- Keep the editor that Pi or an earlier extension set.
- Draw the profile name only over a plain top border, so that the border's own text stays.
