# Pi compatibility for maintainers

[pi-tool-display](../README.md)

> Last verified against Pi 1.4.0 on Linux with a source review of the Pi 1.3.0 to 1.4.0 changes to the hooked Pi methods, the row and assistant components, and the built-in MCP and codemode extensions, the fingerprint check, the offline package checks and API and CLI suites, and an offline tmux run of the fullscreen fixture: mode cycling with Ctrl+O while a shell call runs, cancellation with Esc, and terminal restoration on exit. Not covered: the tmux smoke run of read ranges, a terminal run of the other fullscreen prompts, replay, reload, thinking toggles, Ctrl+O while an extension dialog is open, and the other manual [terminal checks](validation.md); a source diff of the `pi-mcp` and `pi-codemode` packages; physical mouse and image protocols; the Rex terminal; a live `registerToolRenderer` resolver; live MCP and FFF services; and other platforms.

A _fingerprint_ is a hash of an inspected private Pi method's source. The [host compatibility owner](../src/host/compatibility.ts) exports `inspectedPiVersion = "1.4.0"`. Host integration follows the [shared provenance and version policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) so recorded wrappers can compose across reload and restoration.

For host integration, the unwrapped value must be callable. A reviewed hash accepts it on any version. A callable with an unknown hash is accepted only when Pi's public `VERSION` equals the pin. A failed gate leaves the affected feature disabled as described in the [README](../README.md#compatibility).

## Upgrade procedure

1. Review the source of each hooked private method in the API and installed CLI builds: `getRegisteredToolDefinition`, `renderSessionItems`, `handleEvent`, `addMessageToChat`, `addCustomEntryToChat`, `maybeShowThinkingDropNotice`, `addCacheMissNotice`, `addCacheWarmingUsage`, `showExtensionNotify`, `switchTuiMode`, and `updateThinkingBlockVisibility`. Check their recorded predecessors with `unwrapHook`. A change to a native implementation still needs source review.
2. Work through every item under [contracts to verify](#contracts-to-verify).
3. Update fingerprints and the version pin only after the matching contracts are confirmed. This includes the [mode-cycling](#mode-cycling) and [row-chrome](#row-chrome) fingerprints, which need reviewed hashes in both builds.
4. Run the workspace [fingerprint check](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) after you review both builds. Keep its owner registration aligned with every source hash.
5. Run the [package checks](../../../../docs/development.md#focused-validation) and the [host and terminal checks](testing.md#manual-checks). Include regular mode, fullscreen, reload, and replay.
6. Update the "Last verified" line at the top of this file. Record what was not covered there, and put version-specific results under [limitations](#limitations).

## Contracts to verify

Work through every section below when you bump the supported Pi version, checking the API build and the installed CLI build.

### Host hooks

- [ ] The private methods that [host hooks](../src/host/compatibility.ts) wrap still handle construction, row insertion, expansion, thinking, reload, and conditional restoration.
- [ ] Reload installs this extension's hooks over wrappers that other extensions added later.
- [ ] Disposal restores only the hooks that this extension still owns.
- [ ] `getRegisteredToolDefinition` returns the renderers that Pi resolves through `session.extensionRunner.resolveToolRenderers`: extension resolvers from `registerToolRenderer`, then built-in renderers on the registered definition.
- [ ] The [lookup wrapper](../src/host/install.ts) calls `getRegisteredToolDefinition` exactly once.
- [ ] The lookup wrapper gives no adapter to tools that it cannot select.
- [ ] For a registered tool, `resolveToolRenderers(name, () => definition)` returns the resolver renderers, then those of the registered definition, without Pi's built-in renderers.
- [ ] Adapter selection consults no resolver renderers for an unregistered name.
- [ ] After disposal or rebinding, pending events don't reattach old row or assistant hooks.
- [ ] Compaction insertion handling uses the current binding.

The reload and disposal items follow the hook-restoration rule in [AGENTS.md](../AGENTS.md#pi-host-access). Keep the ownership invariant and its reinstallation test.

Adapter selection treats the `resolveToolRenderers` chain as the owner's renderers. Pi uses the same chain for HTML export. Pi's MCP resolver answers every `mcp__` name, but servers register their tools after `/reload` reconstructs rows, and only generic rows can upgrade.

### Assistant presentation

[Host binding and thinking](../src/host/assistant.ts) use the [shared prose markers](../src/rendering/assistant.ts).

- [ ] `updateContent` creates direct `Markdown` children only for prose.
- [ ] Those prose children have symmetric `outputPad`.
- [ ] `updateContent` nests thinking in `MouseRegion`.
- [ ] Assistant prose starts with the `•` marker.
- [ ] Native Markdown transformers still apply to marked prose.
- [ ] Marked prose stays within the width limit.
- [ ] With thinking collapsed, each consecutive group of thinking blocks is hidden after its last `thinking_end`, before the message completes.
- [ ] Thinking creates only group boundaries.
- [ ] Prose and diagnostics create run boundaries.
- [ ] Disposal restores Pi's assistant presentation in the API and installed CLI builds.
- [ ] Streaming completion uses event content indices, not shared mutable partials.
- [ ] Pi rebuilds the row after it records the event.

### Mode cycling

- [ ] `toggleToolOutputExpansion` only negates `toolOutputExpanded` through `setToolsExpanded`.
- [ ] `setToolsExpanded` updates the header, loaded resources, and chat rows before `showStatus`.
- [ ] `getStartupExpansionState` reflects `--verbose`.
- [ ] `showStatus` reuses the native status row.
- [ ] The selected mode survives reconstruction and reload without being persisted.
- [ ] `collapsedMode` sets the starting mode and the mode after a programmatic collapse from `verbose`.
- [ ] **Ctrl+O** follows the [mode cycle](../README.md#usage).

The two expansion methods and their called-only private dependencies, `getStartupExpansionState` and `showStatus`, need reviewed source hashes in the API and installed CLI builds. `getStartupExpansionState` sets the initial expansion. The version pin gives no allowance. A mismatch disables only mode cycling, with the [fallback that the README describes](../README.md#compatibility). Host rendering and session-scoped collection stay active.

### Row chrome

See the [source](../src/host/row-layout.ts). The [glossary](../GLOSSARY.md#transcript-structure) defines row chrome.

- [ ] `ToolExecutionComponent.render` draws a margin, then `selfRenderHeight` rows, then images.
- [ ] Self-rendered rows get no `outputPad` padding from Pi.
- [ ] `handleMouse` subtracts the margin before routing to renderer slots, whose regions call `setExpanded`.
- [ ] Fullscreen `click` events report held Shift, Alt, and Ctrl.
- [ ] Native image components are still public `Image` children.

Without Pi's padding, cards keep their own layout. The modifier flags let cards ignore modified clicks. Because images are `Image` children, width constraints keep Pi's IDs, conversion, caching, and reserved rows.

The `render` and `handleMouse` [fingerprints](../src/host/compatibility.ts) need review in the API and installed CLI builds. On a mismatch, rows keep Pi's chrome (groups keep margin rows), summaries turn off, and the host warns once.

### Native observation

Verify [native observation](../GLOSSARY.md#interpretation) against [native tools](../../../libs/src/native-tools/README.md).

- [ ] Native observation preserves tool middleware.
- [ ] Native observation preserves tool definitions, including exposure and output schemas.
- [ ] Native observation preserves structured results.
- [ ] Native observation preserves active tools.
- [ ] Native observation preserves mutation ordering.
- [ ] Other subscribers still receive their events.
- [ ] A nonzero Bash exit resolves an error result with its exit code.
- [ ] Cancellation and timeout stay distinct.
- [ ] Session-scoped collection runs in TUI, RPC, print, and JSON modes, independently of row mounting.

### Nested execution

- [ ] Calls of Pi's built-in [codemode](../src/adapters/builtin/codemode/README.md) and [MCP](../src/adapters/builtin/mcp/README.md) tools get their dedicated cards.
- [ ] Child execution events create no transcript rows.
- [ ] Child execution events create no orphan [saved call entries](../GLOSSARY.md#interpretation).
- [ ] Child execution events create no duplicate summaries.
- [ ] Only persisted parent calls own replay rows.
- [ ] MCP tools discovered through codemode keep built-in provenance.
- [ ] MCP tools discovered through codemode keep their unsanitised identity in details, including normalised namespaces and collision-suffixed names.
- [ ] Selection doesn't depend on direct exposure or on decoding names.
- [ ] External `pi-mcp-adapter` tools keep their separate provenance contract.

### Transcript

Source: [session.ts](../src/transcript/session.ts) and [saved-calls.ts](../src/transcript/saved-calls.ts).

- [ ] Pi's public `sessionEntryToContextMessages` converts appended custom messages before boundary detection.
- [ ] Visible notices and boundary custom messages from other owners split groups and runs.
- [ ] This extension's instruction notices split groups but not runs, as [notices in runs](presentation.md#notices-and-todo-calls-in-runs) describes.
- [ ] Invisible metadata, hidden messages, and context edits split nothing.
- [ ] Row ownership survives replay slices around boundary compaction summaries.
- [ ] Facts replay only for matching calls on the selected branch.
- [ ] Timestamp associations refresh after appends, branch changes, and resets.
- [ ] Replay never runs tools or observes files again.
- [ ] Public listeners receive a tool result's `message_end` after extension replacement and before Pi appends the result entry, so call entries precede their results.
- [ ] Copies and forks keep entry IDs and entry order.
- [ ] Session changes and shutdown discard pending saved-output reads.
- [ ] `tool_execution_end.durationMs` reports the completed `execute()` duration when the tool ran.
- [ ] A saved `toolResult` keeps that `durationMs`.
- [ ] `ToolRenderContext.durationMs` supplies the final result's duration and is undefined for partial results.

The [lifecycle](../../../libs/src/lifecycle/phases.md#shutdown-phase) shutdown revoke stops collection and appends without awaiting.

### Extension notifications

- [ ] `showExtensionNotify` preserves `ctx.ui.notify` arguments and return values.
- [ ] Groups and runs split only when Pi inserts a visible component, for every severity.
- [ ] No-op notifications and thinking-toggle `showStatus` calls create no boundary.

### Nested-instruction messages

See the [adapter](../src/adapters/pi-nested-instructions/README.md).

- [ ] `registerMessageRenderer` supplies the expansion state.
- [ ] `registerMessageRenderer` keeps the message identity across rebuilds.
- [ ] In fullscreen, `MouseRegion` receives header-relative clicks.
- [ ] Pi's global tool-output expansion updates custom messages.
- [ ] `CustomMessageComponent` uses public `Container` rendering and mouse routing, with one leading `Spacer(1)` followed by the supplied component.
- [ ] `layoutRow` moves the trailing run control after the last notice, keeping header-relative clicks.
- [ ] Notices render from live `message_start` and `entry_appended` events, on replay, and as standalone notices.
- [ ] Reload and removal replace the renderer registry without changing stored content.

### Adapters

- [ ] [Adapters](adapters.md#recognise-tool-contracts) still match their tools on provenance and schemas, including for FFF and MCP consumers.
- [ ] Adapters leave borrowed results unchanged.
- [ ] Adapters still handle cancellation, saved-output references, and image ownership in Pi's results.
- [ ] `validateToolArguments` is still a public `@earendil-works/pi-ai` export.
- [ ] `validateToolArguments` still clones its input.
- [ ] `validateToolArguments` still removes optional nulls that the schema rejects, and converts values to the schema.
- [ ] Pi's execution still validates with `validateToolArguments` after `prepareArguments`.
- [ ] `tool_call` handlers still receive the validated copy.
- [ ] Saved assistant messages and `tool_execution_start` still carry the raw arguments.
- [ ] A `tool_search` that pi-profiles registers with `createToolSearchExtension()` has the pi-profiles entry point as its source path, so the [pi-profiles adapter](../src/adapters/pi-profiles/README.md) matches it, and the built-in adapter does not.
- [ ] Pi's public `formatReadLineRange` returns an empty string when both values are missing or `null`, or when a value is malformed.
- [ ] Pi's own read renderer uses `formatReadLineRange`, as read targets do.

The `validateToolArguments` items keep [callback arguments](adapters.md#callback-arguments) true.

## Limitations

- Public host and observation APIs could replace the private hooks if they keep the contracts above. Trace shared-library consumers before removing a hook.
- Public component methods such as `setExpanded` and `invalidate`, and public session and renderer-resolver calls, retain their declared contracts. They do not need private-method fingerprints. Existing row and assistant fingerprints also guard the private child-layout assumptions that display changes.
- Row and assistant source checks stay strict even when the public version matches the pin.
- On the verified version, a changed native host method can be accepted as an unknown wrapper; version evidence cannot distinguish them. On an unverified version, an unknown wrapper disables host integration until the contracts and version pin are reviewed.
- A public Pi mode-change API could replace the mode-switch wrappers shared with editor widgets.
- In Pi 1.4.0, the host fingerprints were unchanged in the API and CLI builds. The extension dialog stack changed no hooked method, and selectors still toggle tool output through `toggleToolOutputExpansion`.
- In Pi 1.4.0, the source review covered the hooked Pi methods, the row and assistant components, and the built-in MCP and codemode extensions. It did not cover the `pi-mcp` and `pi-codemode` packages.
- In Pi 1.4.0, the API suite covers nested codemode execution, session reload, and later wrappers. The CLI suite checks native construction and selective-read recognition.
- In Pi 1.4.0, `registerToolRenderer` can replace only the lookup hook, not the row, expansion, thinking, reload, or event hooks. The extension keeps its lookup hook because Pi also calls resolvers for HTML export, resolvers run in extension load order, and a resolver receives no host to claim the row's call.
- In Pi 1.4.0, `durationMs` measures the whole `execute()` call, not only the shell or file operation, so shell and mutation durations include tool setup.
- In Pi 1.4.0, a codemode script that cannot get a worker fails with Pi's `Script failed` header and empty `details.calls`. A source review shows that the card hides the header and keeps the error.
- Recheck the [image-row limitation](validation.md#platform-limitations) for finalised-message image updates against each new Pi version. Compare live and replay, with and without this extension.

In Pi 1.4.0, the extension API and its declarations were unchanged, so no public API replaces a private hook yet:

| Private hook                                                                                                                   | Parity                                                      | Public API that Pi would need                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `getRegisteredToolDefinition`                                                                                                  | Partial, through `registerToolRenderer`                     | A row-scoped renderer resolver that receives the host and call, is not used for HTML export, and has a set order |
| `renderSessionItems`, `handleEvent`, and `addMessageToChat`                                                                    | None                                                        | Transcript row lifecycle events with the component and entry ID, and a row-group or layout API                   |
| `maybeShowThinkingDropNotice`, `addCacheMissNotice`, `addCacheWarmingUsage`, `addCustomEntryToChat`, and `showExtensionNotify` | None                                                        | An event for each visible chat insertion that includes the notice kind                                           |
| `toggleToolOutputExpansion`, `setToolsExpanded`, `getStartupExpansionState`, and `showStatus`                                  | Partial, through `ctx.ui.setToolsExpanded` (on or off only) | A tool-output mode API or a Ctrl+O override, and a public status-line update                                     |
| `switchTuiMode`                                                                                                                | None                                                        | A TUI mode-change event                                                                                          |
| `updateThinkingBlockVisibility`                                                                                                | None                                                        | A thinking-visibility change event                                                                               |
| Row `render`, `handleMouse`, and `invalidate`, and `Image.render`                                                              | None                                                        | A row chrome or decorator API for margin, height, mouse offset, and image width                                  |
| `setExpanded` on each row                                                                                                      | None                                                        | An expansion-change callback on `ToolExecutionComponent`                                                         |
| `updateContent`                                                                                                                | None                                                        | An assistant message decorator or renderer API                                                                   |

## Coverage notes

- Real codemode coverage checks adapter selection, four successful nested executions, a nested edit, one persisted parent result, and the absence of child display metadata.
- No automated test covers built-in MCP discovery through codemode, deferred exposure, normalised namespaces, collision-suffixed names, built-in renderer selection, or original server and tool identities. Recheck them with the [nested-execution contracts](#nested-execution).
- For terminal coverage, run the [manual checks](validation.md) for buffered output, thinking toggles, fullscreen summaries, compact-mode reload, and replay in both modes.
- External adapter fixtures don't establish compatibility with the live adapters.
