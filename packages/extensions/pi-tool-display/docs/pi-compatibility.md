# Pi compatibility for maintainers

[pi-tool-display](../README.md)

> Last verified against Pi 1.5.2 with a source review of the Pi 1.5.1 to 1.5.2 changes, the fingerprint check, and the offline package checks with the API and CLI suites on Linux. Not covered: any tmux or terminal run, including fullscreen, mode cycling with **Ctrl+O**, cancellation, replay, reload, thinking toggles, streaming, user `!` rows that Pi moves into the chat when a run settles, and the other manual [terminal checks](validation.md); idle cache-warming notices, which need a live provider; a shell timeout whose background processes outlive the shell; physical mouse and image protocols; the Rex terminal; a live `registerToolRenderer` resolver; live MCP services; and other platforms.

A _fingerprint_ is a hash of an inspected private Pi method's source. The [host compatibility owner](../src/host/compatibility.ts) exports the inspected Pi version as `inspectedPiVersion`. Host integration follows the [shared provenance and version policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) so recorded wrappers can compose across reload and restoration.

For host integration, a failed gate leaves the affected feature disabled as described in the [README](../README.md#pi-version-fallbacks).

## Upgrade procedure

1. Review the source of each hooked private method in the API and installed CLI builds: `getRegisteredToolDefinition`, `renderSessionItems`, `handleEvent`, `addMessageToChat`, `addCustomEntryToChat`, `maybeShowThinkingDropNotice`, `addCacheMissNotice`, `addCacheWarmingUsage`, `showExtensionNotify`, `switchTuiMode`, and `updateThinkingBlockVisibility`. Check their recorded predecessors with `unwrapHook`. A change to a native implementation still needs source review.
2. Work through every item under [contracts to verify](#contracts-to-verify).
3. Update fingerprints and the version pin only after the matching contracts are confirmed. This includes the [mode-cycling](#mode-cycling) and [row-chrome](#row-chrome) fingerprints, which need reviewed hashes in both builds.
4. Run the workspace [fingerprint check](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) after you review both builds. Keep its owner registration aligned with every source hash.
5. Run the [package checks](../../../../docs/development.md#focused-validation) and the [host and terminal checks](testing.md#manual-checks). Include regular mode, fullscreen, reload, and replay.
6. Update the "Last verified" line at the top of this file. Record what was not covered there, and put version-specific results under [limitations](#limitations).

## Contracts to verify

Check each item in the API build and in the installed CLI build.

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
- [ ] Settle insertion handling uses the current binding for the deferred `!` shell rows that Pi moves into the chat on `agent_settled`.

The reload and disposal items follow the [hook and disposal invariants](testing.md#hooks-and-disposal).

Adapter selection treats the `resolveToolRenderers` chain as the owner's renderers. Pi uses the same chain for HTML export. Pi's MCP resolver supplies fallback renderers for names that match `^mcp__(.+?)__(.+)$`, but servers register their tools after `/reload` reconstructs rows, and only generic rows can upgrade.

### Assistant presentation

[Host binding, thinking, and prose markers](../src/host/assistant.ts) rely on these contracts.

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

The `updateContent` [fingerprint](../src/host/assistant.ts) is checked at installation. On a mismatch, assistant rows keep Pi's presentation, and the host warns once that prose markers and early thinking hiding are disabled.

### Mode cycling

- [ ] `toggleToolOutputExpansion` only negates `toolOutputExpanded` through `setToolsExpanded`.
- [ ] `setToolsExpanded` updates the header, loaded resources, chat rows, and pending rows before `showStatus`.
- [ ] `getStartupExpansionState` reflects `--verbose`.
- [ ] `showStatus` reuses the native status row.
- [ ] The selected mode survives reconstruction and reload without being persisted.
- [ ] `collapsedMode` sets the starting mode and the mode after a programmatic collapse from `verbose`.
- [ ] **Ctrl+O** follows the [mode cycle](../README.md#controls).

The two expansion methods and their called-only private dependencies, `getStartupExpansionState` and `showStatus`, need reviewed source hashes in the API and installed CLI builds. `getStartupExpansionState` sets the initial expansion. Unlike the host hooks, these methods get no exception when the Pi version equals `inspectedPiVersion`: every hash must match. A mismatch disables only mode cycling, with the [fallback that the README describes](../README.md#pi-version-fallbacks). Host rendering and session-scoped collection stay active.

### Row chrome

See the [source](../src/host/row-layout.ts). The [glossary](../GLOSSARY.md#transcript-structure) defines row chrome.

- [ ] `ToolExecutionComponent.render` draws a margin, then `selfRenderHeight` rows, then images.
- [ ] Self-rendered rows get no `outputPad` padding from Pi.
- [ ] `handleMouse` subtracts the margin before routing to renderer slots, whose regions call `setExpanded`.
- [ ] Fullscreen `click` events report held Shift, Alt, and Ctrl.
- [ ] Native image components are still public `Image` children.

Without Pi's padding, cards keep their own layout. The modifier flags let cards ignore modified clicks. Because images are `Image` children, width constraints keep Pi's IDs, conversion, caching, and reserved rows.

The `render` and `handleMouse` [fingerprints](../src/host/compatibility.ts) need review in the API and installed CLI builds. On a mismatch, rows keep Pi's chrome (groups keep margin rows), and the host warns once that summaries, card actions, and click modifiers are disabled.

### Native tools

[Native tools](../src/host/native-tools/README.md) depend on these Pi host contracts:

- [ ] Pi constructs native tools through the API and the installed CLI with the `_buildRuntime` and `_refreshToolRegistry` methods that match the fingerprints in [`compatibility.ts`](../src/host/native-tools/compatibility.ts).
- [ ] Wrapped native tools keep their provenance.
- [ ] Borrowed definitions and results reach observers unchanged.
- [ ] Teardown restores only replacements that the module still owns.
- [ ] The local Bash and PowerShell backends reject an abort with an `Error` whose message is `aborted`, and a timeout with `timeout:<seconds>`.
- [ ] Reload activates newly added `defaultTools`.
- [ ] Reload keeps existing active tools when defaults are removed.
- [ ] Reload wraps surviving observers exactly once.

### Native observation

Verify [native observation](../GLOSSARY.md#interpretation) against [native tools](../src/host/native-tools/README.md).

- [ ] Native observation preserves tool middleware.
- [ ] Native observation preserves tool definitions, including exposure and output schemas.
- [ ] Native observation preserves structured results.
- [ ] Native observation preserves active tools.
- [ ] `createEditToolDefinition` and `createWriteToolDefinition` call the injected `readFile` and `writeFile` operations of the shared [file mutation](../src/file-mutations/README.md) source capture inside Pi's per-path mutation queue, and keep the queue locked until an in-flight operation settles after an abort.
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
- [ ] Copies and forks keep the IDs of assistant-message entries, and the order of call entries and their tool results.
- [ ] Session changes and shutdown discard pending saved-output reads.
- [ ] Quit and session changes abort the active run and wait for it to settle before `session_shutdown`.
- [ ] `reload()` rejects during a run or a compaction.
- [ ] `tool_execution_end.durationMs` reports the completed `execute()` duration when the tool ran.
- [ ] A saved `toolResult` keeps that `durationMs`.
- [ ] `ToolRenderContext.durationMs` supplies the final result's duration and is undefined for partial results.

The [lifecycle](../../../libs/src/lifecycle/phases.md#shutdown-phase) shutdown revoke stops collection without awaiting. Call facts are [saved only with Pi's final result](recording.md#session-history), so they depend on the quit, session-change, and `reload()` contracts above.

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

- [ ] [Adapters](adapters.md#recognise-tool-contracts) still match their tools on provenance and schemas, including for MCP consumers.
- [ ] Pi tool metadata still supplies the source and path forms that [`registeredBy`](../src/adapters/provenance.ts) recognises.
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
- Public component methods such as `setExpanded` and `invalidate`, and public session and renderer-resolver calls, retain their declared contracts. They do not need private-method fingerprints. Row and assistant fingerprints also guard the tool-row and assistant child layouts that display changes; the custom-message layout is checked under [nested-instruction messages](#nested-instruction-messages).
- A public Pi mode-change API could replace the mode-switch wrappers shared with editor widgets.
- When a `message_end` handler changes a streamed call from a tool that this extension displays to one that keeps its original renderer, or the reverse, the row keeps the rendering it had while streaming.
- The host hooks belong to one extension runtime per process: a second runtime replaces the first one's hooks. Until Pi announces a session with `session_start`, collection accepts any session manager; after that, it ignores every other one.
- In Pi 1.5.1 and 1.5.2, `renderSessionItems` takes `(items, messageMeta, options)`. `messageMeta` maps each message object to its saved entry ID and timestamp, and Pi passes them to `addMessageToChat`. The reconstruction wrapper forwards every argument and the same item objects, so these lookups still match, and the `addMessageToChat` wrapper forwards its options unchanged.
- In Pi 1.5.1 and 1.5.2, `handleEvent` moves the user's deferred `!` shell rows from the pending-message area into the chat on `agent_settled`. The `handleEvent` wrapper sets a boundary before each row that Pi inserts during `agent_settled` or `compaction_end`.
- In Pi 1.5.1 and 1.5.2, a TUI quit during a run stops the terminal, then cancels the run and waits for it to settle, then emits `session_shutdown`. A warning that the extension raises while that run settles goes to a Pi notification, which the stopped terminal never draws, instead of to stderr.
- In Pi 1.5.1 and 1.5.2, `addCacheWarmingUsage` adds a repeated warming cost to the previous notice while that notice is the last chat row and has the same note. Pi inserts no row then, so the insertion observer sets no boundary.
- In Pi 1.5.1 and 1.5.2, `ToolExecutionComponent.updateArgs` records partial arguments and requests a render. The next `render` applies the latest arguments unless another method refreshes the row first. Summary chrome skips Pi's `render`, but `invalidate`, `setExpanded`, execution start, argument completion, and result updates can still refresh the row. Summaries use call state from events, so they are unaffected.
- In Pi 1.5.1 and 1.5.2, `updateContent` reuses its prose and thinking `Markdown` instances across updates through a private slot list. Prose decoration wraps those instances in new children and leaves the slots unchanged. With an empty hidden-thinking label, Pi omits hidden thinking runs and their spacers itself; thinking suppression then finds fewer regions than runs and changes nothing.
- In Pi 1.5.1 and 1.5.2, regular mode strips the OSC 133 markers that assistant and user rows add to their first line. Prose decoration wraps only `Markdown` children, so the markers stay at the start of the row. The model-scope notice is in the fullscreen header, and extension changelog entries appear at startup in an empty transcript. Neither goes through a hooked method.
- In Pi 1.5.1 and 1.5.2, the built-in MCP extension takes tool naming and input-schema normalisation from the `pi-mcp` package. Registered names, parameter schemas, source info, and MCP result details keep the shapes that the [built-in MCP adapter](../src/adapters/builtin/mcp/README.md) matches. Codemode result details and the `tool_search` result also keep their shapes.
- In Pi 1.5.1 and 1.5.2, `validateToolArguments` runs on `@earendil-works/pi-schema`. It still clones its input, drops optional nulls that the schema rejects, converts values, and truncates fractional integers. Its messages read like `expected integer, got string`. The `pi-agent-core` agent loop is unchanged.
- In Pi 1.5.1 and 1.5.2, tool render contexts and message and entry renderer options supply `keyText` and `keyHint`, and the subagent result renderer forwards them. Expansion hints in `rendering/format.ts` and the mode-cycling warning still import `keyText`. Pi's extension loader resolves that import to the host copy, as the host hooks also require.
- In Pi 1.5.2, transcript restoration also activates extension tools that the branch never added or removed. It reads only the names of `_baseToolDefinitions`, so native observation stays independent of it.
- In Pi 1.5.2, `setActiveTools` keeps the current order of tools that stay active. Native observation does not depend on that order.
- In Pi 1.4.0 to 1.5.2, `registerToolRenderer` can replace only the lookup hook, not the row, expansion, thinking, reload, or event hooks. The extension keeps its lookup hook because Pi also calls resolvers for HTML export, resolvers run in extension load order, and a resolver receives no host to claim the row's call.
- In Pi 1.5.1 and 1.5.2, a shell timeout status also names the shell's exit code when the shell exited but its background processes kept writing output until the timeout. The [native adapter](../src/adapters/native/README.md) styles that whole status as Pi's trailer. The observed fact stays a timeout without an exit code.
- In Pi 1.5.1 and 1.5.2, `edit` diffs only the lines around each replacement, so `details.patch` can align runs of repeated lines differently from a whole-file diff. When its hunks differ from the observed patch, the extension saves its own patch, as [session history](recording.md#session-history) describes.
- In Pi 1.5.1 and 1.5.2, a codemode script that cannot get a worker fails with Pi's `Script failed` header and empty `details.calls`. A source review shows that the card hides the header and keeps the error.
- In Pi 1.5.2, the source changes from 1.5.1 leave the hooked Pi methods (API build and CLI bundle), the row, assistant, and custom-message components, the extension types, the native tools, the built-in MCP, codemode, and `tool_search` extensions, and the `pi-mcp` and `pi-codemode` packages unchanged.
- Recheck the [image-row limitation](validation.md#platform-limitations) for finalised-message image updates against each new Pi version. Compare live and replay, with and without this extension.

Pi 1.5.2 supplies `KeybindingHints` in renderer contexts, `messageId` and `timestamp` in `MarkdownTransformContext`, Markdown transformers for custom messages, summaries, and changelogs, and `Component.capturesViewportInput` for focused viewport keys. None of them replaces a private hook: a Markdown transformer changes only Markdown text, not padding, the prose marker, or thinking rows. No public API replaces a private hook yet:

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
| `_buildRuntime` and `_refreshToolRegistry` in [native tools](../src/host/native-tools/compatibility.ts)                        | None                                                        | A hook that wraps or observes built-in tool definitions at construction and reload and keeps their `sourceInfo`  |

## Coverage notes

- No automated test covers discovery through the real built-in MCP extension, including codemode discovery, deferred exposure, normalised namespaces, collision-suffixed names, and original identities. Synthetic registrations cover adapter selection and result-identity display. Recheck them with the [nested-execution contracts](#nested-execution).
- No automated test covers rows that Pi inserts on `agent_settled`, a cache-warming notice that Pi extends in place, or the shell timeout status that names the shell's exit code.
- External adapter fixtures don't establish compatibility with the live adapters.
