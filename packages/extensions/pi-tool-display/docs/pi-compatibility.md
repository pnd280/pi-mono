# Pi compatibility for maintainers

[pi-tool-display](../README.md)

> Last verified against Pi 1.3.0 on Linux with unchanged host fingerprints, a source diff of the hooked Pi methods, the built-in MCP, tool-search, and codemode extensions, and `pi-mcp` and `pi-codemode`, the API and CLI suites, including the offline MCP and codemode hosts, and a tmux smoke run of the regular-mode `filenames` and `native-mixed` read ranges. Not covered by this review: fullscreen, replay, reload, mode cycling, thinking toggles, and the other manual [terminal checks](validation.md), physical mouse/image protocols, a live `registerToolRenderer` resolver (offline ownership is tested), live MCP and FFF services, or other platforms.

A _fingerprint_ is a hash of an inspected private Pi method's source. When a fingerprint doesn't match, the matching hook stays uninstalled and the feature falls back as described in the [README](../README.md#compatibility).

## Upgrade procedure

1. Work through every item under [contracts to verify](#contracts-to-verify).
2. Update fingerprints only after the matching contract is confirmed.
3. Run the [package checks](../README.md#validation) and the [host and terminal checks](testing.md#manual-checks). Include regular mode, fullscreen, reload, and replay.
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

[Host binding and thinking](../src/host/assistant.ts) use the [shared prose markers](../src/rendering/assistant.ts).

- [ ] `updateContent` creates direct `Markdown` children only for prose, with symmetric `outputPad`, and nests thinking in `MouseRegion`.
- [ ] Prose markers, native Markdown transformers, and width limits work.
- [ ] With thinking collapsed, each consecutive group of thinking blocks is hidden after its last `thinking_end`, before the message completes.
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
- [ ] Self-rendered rows get no `outputPad` padding from Pi, so cards keep their own layout.
- [ ] `handleMouse` subtracts the margin before routing to renderer slots, whose regions call `setExpanded`.
- [ ] Fullscreen `click` events report held Shift, Alt, and Ctrl, so cards can ignore modified clicks.
- [ ] Native image components are still public `Image` children, so width constraints keep Pi's IDs, conversion, caching, and reserved rows.
- [ ] Recheck both [fingerprints](../src/host/compatibility.ts) in the API and installed CLI builds. On mismatch, rows keep Pi's chrome (groups keep margin rows), summaries turn off, and the host warns once.

### Native observation

Verify [native observation](../GLOSSARY.md#interpretation) against [native tools](../../../libs/src/native-tools/README.md).

- [ ] Middleware, definitions (including exposure and output schemas), structured results, active tools, mutation ordering, and other subscribers are preserved.
- [ ] A nonzero Bash exit resolves an error result with its exit code.
- [ ] Cancellation and timeout stay distinct.
- [ ] Session-scoped collection runs in TUI, RPC, print, and JSON modes, independently of row mounting.

### Nested execution

- [ ] The built-in [codemode](../src/adapters/builtin/codemode/README.md) and [MCP](../src/adapters/builtin/mcp/README.md) adapter cards render.
- [ ] Child execution events create no transcript rows, orphan [saved call entries or local lines](../GLOSSARY.md#interpretation), or duplicate summaries. Only persisted parent calls own replay rows.
- [ ] MCP tools discovered through codemode keep built-in provenance and their unsanitised identity in details, including normalised namespaces and collision-suffixed names.
- [ ] Selection doesn't depend on direct exposure or on decoding names.
- [ ] External `pi-mcp-adapter` tools keep their separate provenance contract.

### Transcript

Source: [session.ts](../src/transcript/session.ts) and [saved-calls.ts](../src/transcript/saved-calls.ts).

- [ ] Pi's public `sessionEntryToContextMessages` converts appended custom messages before boundary detection. Visible notices and boundary custom messages from other owners split groups and runs.
- [ ] This extension's instruction notices split only groups, and follow the visibility of the preceding run.
- [ ] Invisible metadata, hidden messages, and context edits split nothing.
- [ ] Row ownership survives replay slices around boundary compaction summaries.
- [ ] Facts replay only for matching calls on the selected branch. Timestamp associations refresh after appends, branch changes, and resets.
- [ ] Replay never runs tools or observes files again.
- [ ] Public listeners receive a tool result's `message_end` after extension replacement and before Pi appends the result entry, so call entries precede their results. Copies and forks keep entry IDs and entry order.
- [ ] Session changes and shutdown invalidate pending saved-output loading. Shutdown flushes queued local lines.

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
- [ ] `validateToolArguments` is still a public `@earendil-works/pi-ai` export. It still clones its input, removes optional nulls that the schema rejects, and converts values. Pi's execution still validates with it after `prepareArguments`, and `tool_call` handlers still receive the validated copy. Saved assistant messages and `tool_execution_start` still carry the raw arguments. See [callback arguments](adapters.md#callback-arguments).
- [ ] Read targets use Pi's public `formatReadLineRange`, which returns an empty string when both values are missing or `null`, or when a value is malformed. Pi's own read renderer uses the same helper.

## Limitations and replacement opportunities

- Public host and observation APIs could replace the private hooks if they keep the contracts above. Trace shared-library consumers before removing a hook.
- As of Pi 1.3.0, `registerToolRenderer` could replace only the lookup hook, not the row, expansion, thinking, reload, or event hooks. It doesn't replace it yet: Pi also calls resolvers for HTML export, resolvers run in extension load order, so an earlier resolver can hide this one, and a resolver receives no host to claim the row's call.
- Pi records each final tool result's `durationMs` in the session and passes it to renderers and `tool_execution_end`. It could replace local shell and mutation timing, so durations would replay on other machines, and could give codemode cards the script's total time that Pi's own row shows. Pi measures the whole `execute()` call, not only the shell or file operation.
- Recheck the [image-row limitation](validation.md#platform-limitations) for finalised-message image updates against each new Pi version. Compare live and replay, with and without this extension.

## Coverage notes

- Real codemode coverage checks its adapter card, summary count, nested mutations, parent-only replay, and the absence of child display metadata.
- A local stdio MCP server checks discovery, deferred exposure, normalised namespaces, collision-suffixed names, built-in renderer selection, and original server and tool identities.
- For terminal coverage, run the [manual checks](validation.md) for buffered output, thinking toggles, fullscreen summaries, compact-mode reload, and replay in both modes.
- External adapter fixtures don't establish compatibility with the live adapters.
