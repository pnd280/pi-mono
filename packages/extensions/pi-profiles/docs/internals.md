# Profiles internals for maintainers

[pi-profiles](../README.md)

This reference is for maintainers who change how a selection resolves, searches, or restores tools, or how the editor shows the profile name. The [user guide on tools](tools.md) describes what users see, and the [compatibility checklist](pi-compatibility.md) lists the Pi contracts that these rules rely on.

## Tool resolution

The [selection](../src/selection.ts) module owns tool resolution, deferral, restoration, and the `deny` enforcement. Each entry point returns a full decision. The switch and the menu's change preview use the same plan, `planSwitch`. The menu only shows state, and it switches through the `/profile <name>` path after it closes.

The user-visible rules are in [patterns](tools.md#patterns), [deferred tools](tools.md#deferred-tools), and [groups](tools.md#groups).

## Tool search

Keep the extension's `tool_search` Pi's own tool from `createToolSearchExtension()`, and change only the tool list that it sees. What it loads, with the rest of a deferred group, is in [tool search](tools.md#tool-search).

## Restoration

Restore only what Pi doesn't. [Pi compatibility](pi-compatibility.md#restoration) lists what Pi restores on resume, `/fork`, `/tree`, and `/reload`; [sessions](sessions.md#restoration) gives what the extension restores, and [testing](testing.md#restoration) the invariants that the tests protect.

Set restored tools only when they change. A call that turns off a tool drops Pi's pending tools.

## Editor

The [label](../src/editor-label.ts) draws the profile name in the editor border.

- Keep the editor that Pi or an earlier extension set.
- Draw the profile name only over a plain top border, so that the border's own text stays.
