# Pi compatibility for maintainers

[pi-editor-widgets](../README.md) · [Testing](testing.md)

> Last verified against Pi 1.4.0 with a source review of the Pi 1.3.0 to 1.4.0 changes to statuses, regions, the footer, mode switching, the extension dialog stack, metrics, compaction thresholds, pi-tui mouse dispatch and exit restoration, and interactive mode, the fingerprint check, the offline package checks and host tests including reload, and an offline tmux run in fullscreen mode of `/widgets` before and after `/reload`, a UI reset by a `SIGTERM` shutdown while `/widgets` is open, and terminal restoration on exit. Not covered: physical-terminal checks, regular mode, mouse clicks, and the other manual checks.

Public APIs don't expose other extensions' registries or row placement, so this extension uses narrowly scoped runtime hooks. It needs no core or dependency edits.

## Upgrade checklist

1. Run the [focused package checks](../../../../docs/development.md#focused-validation), including the shared [interactive host fixture](../../../libs/src/validation/interactive-host/README.md).
2. Work through the host checks below, then run the workspace [fingerprint check](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). Update hashes and the version pin only after reviewing the contracts in both installed builds.
3. Confirm that `/widgets` still mounts through the shared [responsive host](../../../libs/src/tui/responsive-custom-ui/README.md) in regular and fullscreen modes.
4. Do the [terminal checks](validation.md).
5. Update the "Last verified" line.

### Fingerprint boundary

The [host boundary](../src/host.ts) exports `inspectedPiVersion = "1.4.0"` and applies the [shared provenance and version policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) before the discovery probe. It checks the discovered receiver again before acquiring the coordinator.

Each gate unwraps recorded hook predecessors. A callable with a reviewed API or bundled CLI source hash is accepted on any version. A callable with an unknown hash is accepted only when Pi's public `VERSION` equals the pin.

| Method                                               | Why it needs a gate                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `setExtensionStatus`                                 | Discovery temporarily replaces it and intercepts the receiver before native status effects.             |
| `renderWidgets`                                      | The coordinator replaces native region mounting.                                                        |
| `setExtensionFooter`                                 | The coordinator replaces it to detect ownership changes and calls it to acquire and release the footer. |
| `createExtensionUIContext`                           | This private call supplies the live theme getter used by the coordinator.                               |
| `switchTuiMode`                                      | The coordinator rebinds renderer hooks and restores regular-mode usage displays after mode changes.     |
| `TuiMainScreen.doRender` and `TuiAltScreen.doRender` | The coordinator replaces each renderer's frame boundary to invalidate layout measurements.              |

A failed gate leaves the coordinator inactive and reports the existing unsupported-host warning. Public `requestRender`, container methods, footer-provider methods, and session metrics retain capability checks; they are not private implementation hooks.

### Status discovery

During `session_start`, discovery briefly replaces `InteractiveMode.prototype.setExtensionStatus` and sets one random key that is never registered. It gets the real receiver before any native side effects, then restores the method synchronously.

- [ ] `ctx.ui.setStatus()` still dispatches through `InteractiveMode.prototype.setExtensionStatus`, with the interactive mode as the receiver.
- [ ] The UI closures that Pi copies into the extension context still dispatch through that method, also when the extension is first enabled on `/reload`.

### Regions and footer

If a host property below is missing, the capability check fails with a diagnostic instead of silently losing contributors. The coordinator reproduces native widget spacing. On release, it restores registered native widgets and above-editor spacing only where its region component is still present, and it leaves later owners' region components and sibling components in place.

- [ ] `InteractiveMode` still has `extensionWidgetsAbove`, `extensionWidgetsBelow`, `footerDataProvider`, the region, editor, status, and pending containers, `renderWidgets`, and `setExtensionFooter`.
- [ ] Pi's native widget maps still own factory calls, replacement of the same key, disposal, and unregistration.
- [ ] Native widget spacing is still one blank line above the editor, also when that region is empty, and none below it.

### Renderer and mode switching

The coordinator hooks the real renderer's `requestRender` and protected `doRender` methods, restores owned hooks when Pi replaces the renderer, and rebinds after mode switches. The `switchTuiMode` gate follows recorded predecessors, including tool-display's wrapper, so both extensions can compose across reload and restoration. Keyboard input can bypass `requestRender`, so the `doRender` hook clears cached measurements once per frame, and dynamic widget content stays current across all regions.

The compositor recognises image prefixes before text measurement and preserves complete output under the [image placement policy](../README.md#usage). Image geometry, identifiers, and terminal placement remain Pi-owned.

- [ ] The stable `ui` reference is still a forwarding proxy, and `renderer` still returns the real renderer behind it.
- [ ] The real renderer still renders each frame through its protected `doRender` method, also when keyboard input bypasses `requestRender`.
- [ ] `switchTuiMode` still performs every switch between regular and fullscreen modes.
- [ ] The public `mode` property still reports the current mode, so the extension can gate fullscreen toggling of the usage widgets and restore the regular-mode displays.
- [ ] Region invalidation still reaches borrowed native components.
- [ ] Native `Image` output still starts with Kitty (`\x1b_G`) or iTerm2 (`\x1b]1337;File=`) sequences.

### Custom footer

An existing custom footer prevents acquisition. A later replacement releases the coordinator, and cleanup doesn't overwrite it.

- [ ] `setExtensionFooter` still disposes the previous custom footer before it creates the next one.
- [ ] `setExtensionFooter` still stores the new footer in `customFooter`, and a call without a factory restores the built-in footer.
- [ ] `footerDataProvider.onBranchChange()` still returns a function that ends the subscription.

### Mouse dispatch

Translating coordinates must not focus otherwise passive components. Forward each copy's render width, not the width of its hit area.

- [ ] Native containers still propagate the `target` geometry and the optional `focusTarget` of a mouse result for capture and focus.
- [ ] Native containers still validate cached child layout against the mouse event width.
- [ ] When a handled primary press keeps the usage widget's target across redraws until release, Pi still synthesises one click.

### Session lifecycle

Shutdown releases adapters but doesn't dispose borrowed widgets. A new start loads preferences and keeps no stale session components.

- [ ] On `/reload`, Pi still emits `session_shutdown` for the old extension instance before `session_start` for the new one.
- [ ] Pi's native UI reset still disposes extension widgets on shutdown, new sessions, and reload.
- [ ] Pi's native UI reset still disposes every stacked extension dialog, including an open inline `/widgets` menu, and the menu promise settles. Pi 1.4.0 added this dialog stack.

### Metrics

Never render an unknown context window as zero. The label shows the selected model, and, under a virtual selection, the routed model as `→ id:level`. The [built-in footer fields](../src/builtins.ts) copy the sources of Pi's native footer.

- [ ] `getSessionStats()` includes usage, tool-result, compaction, and branch-summary entries.
- [ ] The latest assistant message's prompt usage sets the cache-hit percentage.
- [ ] `getContextUsage()` keeps unknown counts after compaction.
- [ ] `getContextUsage()` returns no usage when the effective model's window is unknown.
- [ ] `autoCompactionEnabled` is runtime state.
- [ ] `settingsManager.getCompactionReserveTokens(session.model)` returns the selected model's reserve for the verbose threshold, and can reject invalid settings.
- [ ] Pi's `_exceedsCompactionThreshold` and `_checkCompaction(assistantMessage, skipAbortedCheck)` combine the selected model's reserve with the physical window, even when the physical model has a different reserve configured.
- [ ] `session.routedModel` gives the physical model and thinking level of the latest successful response under a virtual selection.
- [ ] Pi's native footer still shows "(sub)" when the provider is `kimi-coding` or `session.modelRuntime.isUsingSubscription(provider)` returns true, as `builtin:tokens` does.
- [ ] Pi's native footer still shows the thinking level only when `model.reasoning` is true, and reads it from `session.thinkingLevel`, as `builtin:model` does.
- [ ] Pi's native footer still reads the session name from `sessionManager.getSessionName()`, as `builtin:session-title` does.
- [ ] Pi's native footer still abbreviates a working directory inside `HOME`, or `USERPROFILE` when `HOME` is unset, to `~`, as `builtin:cwd` does.
- [ ] Pi's native footer still reads the git branch from `footerDataProvider.getGitBranch()`, as `builtin:git-branch` does.

## Limitations

- [Mouse input](../README.md#side-effects) works only in fullscreen mode. The usage widgets use `MouseRegion` to claim primary presses, and toggle on Pi's synthesised click without taking focus. Regular mode keeps the original non-interactive displays.
- A custom footer is exclusive, not composable. Contribute through native widgets and statuses, or disable the competing footer extension.
- On the verified version, a changed native host or renderer method can be accepted as an unknown wrapper; version evidence cannot distinguish them. On an unverified version, an unknown wrapper disables the coordinator until the contracts and version pin are reviewed.
- Both installed renderer implementations and the current renderer are checked at acquisition. Recheck replacement renderers before rebinding their private frame hook; unrelated later host-method replacements are outside the acquisition check.
- Copies share one native instance and render at the same terminal width. Mouse dispatch uses that width, not the compacted hit area. Drag capture after a later frame follows the component's most recent render geometry.
- Components expose `render(width)`, not a preferred size. Each placement renders once at terminal width, and the output it occupies sets its row width. Whole widgets wrap in order without shrinking, and a full-width component takes its own row. Widgets control wrapping inside their own output.
- While `/widgets` is open, the menu sizes itself from the unclipped region height, so tall regions still clip on short terminals.
- Shared rows trim only literal trailing spaces known not to paint or carry metadata. Backgrounds, decorated spaces, and unknown escape sequences keep their width. Leading indentation and singleton padding are kept.
- In Pi 1.4.0, the renderer already expands visible tabs to the three columns `visibleWidth()` uses. The extension must not rewrite tabs inside OSC or APC payloads.
- Automated fixtures use real Pi renderers and the native fullscreen dock, without startup downloads, process signal handlers, or a physical terminal. They don't establish visual quality for every component or terminal emulator.

In Pi 1.4.0, the extension API and the pi-tui declarations were unchanged, so no public API replaces a private hook yet:

| Private hook                   | Parity                              | Public API that Pi would need                                |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| `setExtensionStatus` probe     | None                                | A read API for other extensions' widgets and statuses        |
| `renderWidgets`                | None                                | A widget layout or placement provider                        |
| `setExtensionFooter`           | Partial, through `ctx.ui.setFooter` | A footer-ownership change event                              |
| `createExtensionUIContext`     | Partial, through `ctx.ui.theme`     | None, if the coordinator takes the theme from `ctx.ui.theme` |
| `switchTuiMode`                | None                                | A TUI mode-change event                                      |
| `doRender` and `requestRender` | None                                | A renderer frame or lifecycle hook                           |

When Pi adds a public registry, layout, mode-change, or renderer-lifecycle API, use it instead of the matching private hook. Replace the boundary and its tests together, without transitional adapters.
