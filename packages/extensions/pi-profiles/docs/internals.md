# Profiles internals for maintainers

[pi-profiles](../README.md)

This reference is for maintainers who change how a selection resolves, searches, or restores tools, or how the editor shows the profile name. The [user guide on tools](tools.md) describes what users see, and the [compatibility checklist](pi-compatibility.md) lists the Pi contracts that these rules rely on.

## Tool resolution

The [selection](../src/selection.ts) module owns tool resolution, deferral, restoration, and the `deny` enforcement. Each entry point returns a full decision. The switch and the menu's change preview use the same plan, `planSwitch`. The menu only shows state, and it switches through the `/profile <name>` path after it closes.

- Match `*` patterns as Pi's `--tools` does (`toolPatternRegExp` in Pi's `core/mcp-servers.js`, which Pi does not export).
- The user-visible rules are in [patterns](tools.md#patterns), [deferred tools](tools.md#deferred-tools), and [groups](tools.md#groups); `planSwitch` implements them for both the switch and the menu preview.
- Keep the [MCP tools](tools.md#mcp-tools) tables in step with tool resolution and with Pi's MCP support.

## Tool search

- Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`. Change only the tool list that it sees.
- What it loads, with the rest of a deferred group, is in [tool search](tools.md#tool-search).
- Leave the selection's `deny` tools out of the list.
- Without deferred or `deny` tools, the list must equal Pi's, because the copy replaces Pi's built-in `tool_search` also for users who defer nothing.

## Restoration

Restore only what Pi doesn't. [Pi compatibility](pi-compatibility.md#restoration) lists what Pi restores on resume, `/fork`, `/tree`, and `/reload`.

- Declare a selection's tools when no request follows the selection: no system message and no response. Pi can omit the system message when a request changes neither the tools nor the prompt. A compaction checkpoint copies an earlier record, so it does not count as a request.
- On `/reload`, turn off again only what the selection turned off and no later request declared. Pi loads the module again on `/reload`, and the extension keeps no state outside the session, so it cannot see the tools from before `/reload`.
- Apply a selection's saved tools and deferral only when the current settings supply its profile from the same settings scope. Otherwise restore as for a branch without a selection, so a project profile in a project that is no longer trusted chooses no tools, also when a global profile has its name.
- When a tree destination has neither a selection nor recorded tools, undo the outgoing profile's tool changes, under the same condition.
- Set restored tools only when they change. A call that turns off a tool drops Pi's pending tools.
- When the extension does not own `tool_search`, declare a selection's deferred `direct` and `model-only` tools again.
- When no registered, non-hidden `tool_search` is active, or the selected profile denies it, declare all registered, non-hidden deferred tools again.
- Keep `/tree` restoration in `session_tree`.

## Editor

The [label](../src/editor-label.ts) draws the profile name in the editor border.

- Keep the editor that Pi or an earlier extension set.
- Draw the profile name only over a plain top border, so that the border's own text stays.
