# Profiles internals for maintainers

[pi-profiles](../README.md)

This reference is for maintainers who change how a selection resolves, searches, or restores tools, how MCP presets combine with a profile, or how the editor shows the profile name. The [user guide on tools](tools.md) describes what users see, and the [compatibility checklist](pi-compatibility.md) lists the Pi contracts that these rules rely on.

## Tool resolution

The [selection](../src/selection.ts) module owns tool resolution, deferral, restoration, and the `deny` enforcement. Each entry point returns a full decision. The switch and the menu's change preview use the same plan, `planSwitch`. The menu only shows state, and it switches through the `/profile <name>` path after it closes.

The user-visible rules are in [patterns](tools.md#patterns), [deferred tools](tools.md#deferred-tools), and [groups](tools.md#groups).

## Tool search

Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`, and change only the tool list that it sees. What it loads, with the rest of a deferred group, is in [tool search](tools.md#tool-search).

## Restoration

Restore only what Pi doesn't. [Pi compatibility](pi-compatibility.md#restoration) lists what Pi restores on resume, `/fork`, `/tree`, and `/reload`; [sessions](sessions.md#restoration) gives what the extension restores, and [testing](testing.md#restoration) the invariants that the tests protect.

Set restored tools only when they change. A call that turns off a restored tool drops Pi's pending tools. On resume, `/fork`, and `/tree`, when no request followed the selection, restoration starts from `selection.tools` and keeps active `direct` and `model-only` tools that the selection did not know unless the profile denies them, so an unchanged MCP preset server's direct tools stay declared across `/tree`; see [MCP presets](#mcp-presets).

## MCP presets

The [presets](../src/presets.ts) module owns the preset rules: the preset resolution, the effective servers, the namespace clashes, the toggle, the `--mcp-presets` parsing, the restoration of saved presets, and the server plan, `planServers`. The [adapter](../src/index.ts) keeps the active presets and runs the unregistrations of each plan, for removed and changed servers, before its registrations, so that a preset server can replace a profile server in its namespace; [MCP servers](pi-compatibility.md#mcp-servers) lists the Pi contract that frees the namespace.

- Write a `pi-profiles.mcp-presets` entry only when a toggle, the profile, or an applicable `--mcp-presets` flag supplies a preset choice, never when a switch keeps the active presets, as for a profile without `mcpPresets` or a `defaultProfile` on a branch with saved presets. [Sessions](sessions.md#restoration) and [testing](testing.md#mcp-presets) give the secret-free entry contract.
- Resolve a profile's `mcpPresets` after the global and project presets merge, so that a project preset that replaces a global one takes part in the profile's validation.
- Pass an applicable `--mcp-presets` list into the startup switch through `PresetPolicy`, instead of letting the startup profile connect its own presets first, and save the flag's presets also when the startup profile does not apply. Show restoration warnings only when the restored presets stay active; see [startup MCP presets](sessions.md#startup-mcp-presets).

## Editor

The [label](../src/editor-label.ts) draws the profile name in the editor border.

- Keep the editor that Pi or an earlier extension set.
- Draw the profile name only over a plain top border, so that the border's own text stays.
