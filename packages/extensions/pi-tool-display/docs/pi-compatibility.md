# Pi compatibility for maintainers

[pi-tool-display](../README.md)

> Last verified against Pi 1.0.2 on Linux with unchanged host fingerprints, API and CLI suites, and headless viewer probes. Earlier tmux smoke checks covered regular/fullscreen `summary`, **Ctrl+O**, two reloads, `explore`, and byte-preserving saved-session replay; they predate the current UI revisions. Not covered by this review: real-terminal behaviour, physical mouse/image protocols, a live `registerToolRenderer` resolver (offline ownership is tested), live MCP and FFF services, or other platforms.

A _fingerprint_ is a hash of an inspected private Pi method's source. When a fingerprint doesn't match, the matching hook stays uninstalled and the feature falls back as described in the [README](../README.md#compatibility).

## Upgrade procedure

1. Work through every item in the checklist below, inspecting both the API build and the installed CLI build.
2. Update fingerprints only after the matching contract is confirmed.
3. Run the [package checks](../README.md#validation), the [API](../src/host/install.test.ts) and [CLI](../src/host/install-cli.test.ts) suites, and the [terminal and adapter checks](validation.md). Include regular mode, fullscreen, reload, and replay.
4. Update the "Last verified" line at the top of this file. Record what was not covered there, not in a separate log.

## Contracts to verify

Work through every section below when you bump the supported Pi version, checking the API build and the installed CLI build.

### Host hooks

- [ ] [Host hooks](../src/host/compatibility.ts) cover construction, row insertion, expansion, thinking, reload, and conditional restoration.
- [ ] `getRegisteredToolDefinition` returns the renderers that Pi resolves through `session.extensionRunner.resolveToolRenderers`: extension resolvers from `registerToolRenderer`, then built-in renderers on the registered definition. The [lookup wrapper](../src/host/install.ts) calls it exactly once and gives no adapter to tools that it cannot select.
- [ ] For registered tools, adapter selection treats `resolveToolRenderers(name, () => definition)` as the owner's renderers: resolvers, then the registered definition, without Pi's built-in renderers. Pi uses the same chain for HTML export. Unregistered names get no resolver renderers. Pi's MCP resolver answers every `mcp__` name, but servers register their tools after `/reload` reconstructs rows, and only generic rows can upgrade.
- [ ] After disposal or rebinding, pending events don't reattach old row or assistant hooks.
- [ ] Compaction insertion handling uses the current binding.

### Assistant presentation

[Host binding and thinking](../src/host/assistant.ts) use the [shared prose markers](../src/rendering/assistant.ts), which the foreign viewer also uses.

- [ ] `updateContent` creates direct `Markdown` children only for prose, with symmetric `outputPad`, and nests thinking in `MouseRegion`.
- [ ] Prose markers, native Markdown transformers, and width limits work.
- [ ] Thinking is hidden at each run's last `thinking_end`, before the message completes.
- [ ] Thinking creates only group boundaries; prose and diagnostics create run boundaries.
- [ ] Restoration works in the API and installed CLI builds.
- [ ] Streaming completion uses event content indices, not shared mutable partials. Pi rebuilds the row after recording the event.

### Mode cycling

- [ ] `toggleToolOutputExpansion` only negates `toolOutputExpanded` through `setToolsExpanded`.
- [ ] `setToolsExpanded` updates the header, loaded resources, and chat rows before `showStatus`.
- [ ] `getStartupExpansionState` reflects `--verbose`.
- [ ] The selected mode survives reconstruction and reload without being persisted.
- [ ] `collapsedMode` controls startup and programmatic collapse from verbose. **Ctrl+O** follows the fixed cycle.
- [ ] Recheck both method fingerprints in the API and installed CLI builds. On mismatch, **Ctrl+O** toggles only between the collapsed mode and verbose.

### Row chrome

[Source](../src/host/row-layout.ts); row chrome is defined in the [glossary](../GLOSSARY.md#transcript-structure).

- [ ] `ToolExecutionComponent.render` draws a margin, then `selfRenderHeight` rows, then images.
- [ ] `handleMouse` subtracts the margin before routing to renderer slots, whose regions call `setExpanded`.
- [ ] Native image components are still public `Image` children, so width constraints keep Pi's IDs, conversion, caching, and reserved rows.
- [ ] Recheck both [fingerprints](../src/host/compatibility.ts) in the API and installed CLI builds. On mismatch, rows keep Pi's chrome (groups keep margin rows), summaries turn off, and the host warns once.

### Native observation

See [native tools](../../../libs/src/native-tools/README.md).

- [ ] Middleware, definitions (including exposure and output schemas), structured results, active tools, mutation ordering, and other subscribers are preserved.
- [ ] A nonzero Bash exit resolves an error result with its exit code.
- [ ] Cancellation and timeout stay distinct.
- [ ] Session-scoped collection runs in TUI, RPC, print, and JSON modes, independently of row mounting. Public events reconcile with persisted entries before final summaries.
- [ ] If native construction discovery is unavailable, the public collector can still verify extension contracts and leaves unresolved renderer ownership unavailable.

### Nested execution

- [ ] The built-in [codemode](../src/adapters/builtin/codemode/README.md) and [MCP](../src/adapters/builtin/mcp/README.md) adapter cards render.
- [ ] Child execution events create no transcript rows, orphan display facts, or duplicate summaries. Only persisted parent calls own replay rows.
- [ ] MCP tools discovered through codemode keep built-in provenance and their unsanitized identity in details, including normalized namespaces and collision-suffixed names.
- [ ] Selection doesn't depend on direct exposure or on decoding names.
- [ ] External `pi-mcp-adapter` tools keep their separate provenance contract.

### Transcript

[Source](../src/transcript/session.ts).

- [ ] Pi's public `sessionEntryToContextMessages` converts appended custom messages before boundary detection. Visible notices and boundary custom messages from other owners split groups and runs.
- [ ] This extension's instruction notices split only groups, and follow the visibility of the preceding run.
- [ ] Invisible metadata, hidden messages, and context edits split nothing.
- [ ] Row ownership survives replay slices around boundary compaction summaries.
- [ ] Facts replay only for matching calls on the selected branch. Timestamp associations refresh after appends, branch changes, and resets.
- [ ] Replay never runs tools or observes files again.
- [ ] `SessionManager.inMemory` accepts owned decoded entries without filesystem writes. Foreign sources use `parseSessionEntries`, not `SessionManager.open`.
- [ ] RPC deltas and replacement snapshots reconcile once on the active branch, including compaction, context-edited results, and leaf moves. Ordinary messages still require `get_entries` refreshes.
- [ ] Public `ToolExecutionComponent` renderer slots and image sizing preserve shared row layout without private viewer access.
- [ ] Session changes and shutdown invalidate pending publication, saved-output loading, and view callbacks.

### Extension notifications

- [ ] `showExtensionNotify` preserves `ctx.ui.notify` arguments and return values.
- [ ] Groups and runs split only when a visible component is actually inserted, for every severity.
- [ ] No-op notifications and thinking-toggle `showStatus` calls create no boundary.

### Nested-instruction messages

[Adapter](../src/adapters/pi-nested-instructions/README.md).

- [ ] `registerMessageRenderer` supplies expansion state and keeps message identity across rebuilds.
- [ ] In fullscreen, `MouseRegion` receives header-relative clicks. Pi's global tool-output expansion updates custom messages.
- [ ] `CustomMessageComponent` uses public `Container` rendering and mouse routing, with one leading `Spacer(1)` followed by the supplied component.
- [ ] `layoutRow` moves the trailing run control after the last notice, keeping header-relative clicks.
- [ ] Live `message_start`, `entry_appended`, replay, and standalone notices work.
- [ ] Reload and removal replace the renderer registry without changing stored content.

### Adapters

- [ ] [Adapters](adapters.md) still match on provenance and schemas, treat results as borrowed, and handle cancellation, saved-output references, and image ownership, including for FFF and MCP consumers.

## Limitations and replacement opportunities

- Public host and observation APIs could replace the private hooks if they keep the contracts above. Trace shared-library consumers before removing a hook.
- `registerToolRenderer` (Pi 1.0.1) could replace only the lookup hook, not the row, expansion, thinking, reload, or event hooks. It doesn't replace it yet: Pi also calls resolvers for HTML export, resolvers run in extension load order, so an earlier resolver can hide this one, and a resolver receives no host to claim the row's call.
- Recheck the [image-row limitation](validation.md#platform-limitations) for finalized-message image updates against each new Pi version. Compare live and replay, with and without this extension.

## Coverage notes

- Real codemode coverage checks its adapter card, summary count, nested mutations, parent-only replay, and the absence of child display metadata.
- A local stdio MCP server checks discovery, deferred exposure, normalized namespaces, collision-suffixed names, built-in renderer selection, and original server and tool identities.
- For terminal coverage, run the [manual checks](validation.md) for buffered output, thinking toggles, fullscreen summaries, compact-mode reload, and replay in both modes.
- External adapter fixtures don't establish compatibility with the live adapters.
