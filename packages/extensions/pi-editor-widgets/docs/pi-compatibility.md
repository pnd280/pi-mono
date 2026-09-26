# Pi compatibility

[pi-editor-widgets](../README.md)

Verified against installed Pi **0.87.1**. Public APIs do not expose other extensions' registries or row placement, so this extension uses narrowly scoped runtime hooks. No core or dependency edits are required.

## Upgrade checklist

1. Run [package checks and tests](../README.md#validation), including the shared [interactive host fixture](../../../libs/src/validation/interactive-host/README.md).
2. Verify `InteractiveMode.prototype.setExtensionStatus`. Discovery temporarily intercepts one random, never-registered key during `session_start`, obtains the real receiver before native side effects, and restores the method synchronously. The copied UI closures must still dispatch through that method, including when the extension is first enabled on `/reload`.
3. Verify `extensionWidgetsAbove`, `extensionWidgetsBelow`, `footerDataProvider`, region/editor/status/pending containers, `renderWidgets`, and `setExtensionFooter`. The capability check must fail with a diagnostic rather than silently lose contributors. Native maps must still own factory invocation, same-key replacement, disposal, and unregistration.
4. Verify `renderer`, the stable `ui` proxy, and `switchTuiMode`. The coordinator hooks the actual renderer's `requestRender`, restores it when Pi replaces the renderer, and rebinds after switching modes. Region invalidation must still reach borrowed native components.
5. Verify custom-footer storage, reset order, and branch subscription disposal. Existing custom footers must prevent acquisition; later replacements must release the coordinator without being overwritten during cleanup.
6. Verify container mouse dispatch. Pi 0.87.1 propagates the native `target` geometry and optional `focusTarget` for capture/focus; coordinate translation must not focus otherwise passive components.
7. Verify session shutdown/start and reload ordering. Shutdown releases adapters but does not dispose borrowed widgets. Native UI reset owns disposal. New starts load preferences and must not retain stale session components.
8. Verify metric APIs: `getSessionStats()` includes usage, tool-result, compaction and branch-summary entries; latest assistant prompt usage determines cache-hit percentage; `getContextUsage()` preserves unknown post-compaction counts; `autoCompactionEnabled` is runtime state. Check subscription reporting, thinking support, session names, home abbreviation, and native git branch representation.
9. Verify custom UI mounting through the shared [responsive host](../../../libs/src/tui/responsive-custom-ui/README.md) and perform the [terminal checks](testing.md#terminal-checks).

## Limitations and replacement opportunities

- A custom footer is exclusive, not composable. Use native widgets/statuses for contributors or disable the competing footer extension.
- Components expose `render(width)`, not preferred-size metadata. Two-pass measurement and reflow are best effort. Passive previews reuse snapshots and may differ from live wrapping at another width.
- Automated fixtures use real Pi renderers and the native fullscreen dock without startup downloads, process signal handlers, or a physical terminal. They do not establish visual quality for every component or terminal emulator.
- Prefer a future public registry/layout or renderer-lifecycle API over the corresponding private hook. Replace the boundary and its tests together, without transitional adapters.
