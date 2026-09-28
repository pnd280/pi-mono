# Pi compatibility

[pi-tool-display](../README.md)

## Contracts to verify

- [ ] [Host hooks](../src/host/compatibility.ts): construction, row insertion, expansion, thinking, reload, and conditional restoration; inspect API and installed CLI before changing fingerprints. Pending events must not reattach old row/assistant hooks after disposal or rebinding; compaction insertion handling must use the current binding.
- [ ] [Assistant presentation](../src/host/assistant.ts): `updateContent` creates direct `Markdown` children only for prose, with symmetric `outputPad`, and nests thinking in `MouseRegion`. Verify prose markers, native Markdown transformers, width limits, thinking suppression at each run's last `thinking_end` before message completion, thinking-only group boundaries versus prose/diagnostic run boundaries, and restoration in API and installed CLI builds. Streaming completion uses event content indices, not shared mutable partials; Pi must rebuild the row after the event is recorded.
- [ ] Mode cycling: `toggleToolOutputExpansion` must only negate `toolOutputExpanded` through `setToolsExpanded`, which updates the header, loaded resources, and chat rows before `showStatus`; `getStartupExpansionState` must reflect `--verbose`. Preserve the selected mode across reconstruction/reload without persisting it. `collapsedMode` controls startup and programmatic collapse from verbose; Ctrl+O follows the fixed cycle. Recheck both method fingerprints for the API and installed CLI builds. On mismatch, the hooks stay uninstalled and Ctrl+O toggles only the collapsed mode and verbose.
- [ ] [Row chrome](../src/host/row-layout.ts): `ToolExecutionComponent` `render` renders a margin, `selfRenderHeight` rows, then images; `handleMouse` subtracts the margin before routing to renderer slots, whose regions call `setExpanded`. Recheck both [fingerprints](../src/host/compatibility.ts) for the API and installed CLI builds. On mismatch, rows keep Pi's chrome (groups keep margin rows), summaries are disabled, and the host warns once.
- [ ] [Native observation](../../../libs/src/native-tools/README.md): preserve middleware, definitions, active tools, mutation ordering, and other subscribers.
- [ ] [Transcript](../src/transcript/session.ts): visible notices and boundary custom messages split groups and runs; invisible metadata, hidden messages, and context edits do not. Preserve row ownership across replay slices around boundary compaction summaries. Replay facts only for matching calls on the selected ancestry, with timestamp associations refreshed after appends, branch changes, and resets. Replay must not execute tools or reobserve files.
- [ ] Extension notifications: `showExtensionNotify` must preserve `ctx.ui.notify` arguments and return values. Split groups/runs only on actual visible insertion for every severity; no-op notifications and thinking-toggle `showStatus` calls create no boundary.
- [ ] [Adapters](adapters.md): verify provenance, schemas, borrowed results, cancellation, saved-output references, and image ownership, including FFF/MCP consumers.

## Limitations and replacement opportunities

- Public host/observation APIs could replace private hooks if they preserve the contracts above; trace shared-library consumers before removal.
- [Pi 0.87.0 image-row limitation](validation.md#platform-limitations): revisit finalized-message image updates against the target; compare live and replay with and without this extension.

## Validation

Use [package checks](../README.md#validation), [API](../src/host/install.test.ts) and [CLI](../src/host/install-cli.test.ts) suites, and [terminal/adapter checks](validation.md). Include regular/fullscreen, reload, and replay.
