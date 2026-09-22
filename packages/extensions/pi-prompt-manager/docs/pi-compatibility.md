# Pi compatibility

[pi-prompt-manager](../README.md)

## Contracts to verify

- [ ] [Lifecycle/capture](../src/index.ts): activate only after TUI startup; preserve input ordering, capture exclusions, reload cleanup, and no non-TUI settings/storage access.
- [ ] [Editor](../src/host/editor.ts): expanded paste, safe restoration without submission/history insertion, and concurrent-edit protection.
- [ ] [Browser](../src/browser/open.ts): Pi keybindings, remounts at the 19/18-row inline/overlay boundary, cancellation, and restoration only after final closure.
- [ ] [Fullscreen paging](../../../libs/src/tui/responsive-custom-ui/README.md#fullscreen-input-ownership): list/preview/inspection paging leaves the transcript fixed and respects search/dialog focus. Unsupported routing warns once per opening without closing the view.

## Limitations and replacement opportunities

- [Restoration may normalize tabs/line endings](../README.md#restore-text). Revisit lossless editor APIs without sacrificing terminal safety or exact stored/copied source.
- Compare new history, browser, clipboard, and storage APIs with current contracts. Native-only clipboard transport, private storage, and capture exclusions are deliberate policies, not gaps to remove.

## Validation

Use [package, API/CLI, terminal, and platform checks](validation.md). Shared mounting/interaction coverage belongs to [libs TUI](../../../libs/src/tui/README.md#validation).
