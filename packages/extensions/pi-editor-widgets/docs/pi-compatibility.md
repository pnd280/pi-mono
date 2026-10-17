# Pi compatibility for maintainers

[pi-editor-widgets](../README.md) · [Testing](testing.md)

> Last verified against Pi 1.3.0 (package checks, offline host tests, API/CLI provenance probes for load order and reload, and source review of statuses, regions, the footer, mode switching, metrics, compaction thresholds, pi-tui mouse dispatch, and interactive mode). Not covered: physical-terminal and manual checks.

Public APIs don't expose other extensions' registries or row placement, so this extension uses narrowly scoped runtime hooks. It needs no core or dependency edits.

## Upgrade checklist

1. Run the [package checks and tests](../README.md#validation), including the shared [interactive host fixture](../../../libs/src/validation/interactive-host/README.md).
2. Work through the host checks below, then run the workspace [fingerprint check](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). Update hashes and the version pin only after reviewing the contracts in both installed builds.
3. Check custom UI mounting through the shared [responsive host](../../../libs/src/tui/responsive-custom-ui/README.md).
4. Do the [terminal checks](validation.md).
5. Update the "Last verified" line.

### Fingerprint boundary

The [host boundary](../src/host.ts) exports `inspectedPiVersion = "1.3.0"` and applies the [shared provenance and version policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints) before the discovery probe. It checks the discovered receiver again before acquiring the coordinator.

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

Verify `InteractiveMode.prototype.setExtensionStatus`.

- During `session_start`, discovery briefly intercepts one random key that is never registered.
- It gets the real receiver before any native side effects, and restores the method synchronously.
- The copied UI closures must still dispatch through that method, including when the extension is first enabled on `/reload`.

### Regions and footer

Verify `extensionWidgetsAbove`, `extensionWidgetsBelow`, `footerDataProvider`, the region, editor, status, and pending containers, `renderWidgets`, and `setExtensionFooter`.

- If any is missing, the capability check fails with a diagnostic instead of silently losing contributors.
- Native maps still own factory calls, replacement of the same key, disposal, and unregistration.
- The coordinator reproduces native widget spacing: one blank line above the editor, even when empty, and none below.
- On release, it restores registered native widgets and above-editor spacing only where its region component is still present.
- It leaves later owners' region components and sibling components in place.

### Renderer and mode switching

Verify `renderer`, the stable `ui` proxy, and `switchTuiMode`.

- The coordinator hooks the real renderer's `requestRender` and protected `doRender` methods, restores owned hooks when Pi replaces the renderer, and rebinds after mode switches.
- The `switchTuiMode` gate follows recorded predecessors, including tool-display's wrapper, so both extensions can compose across reload and restoration.
- Keyboard input can bypass `requestRender`. The `doRender` hook clears cached measurements once per frame so dynamic widget content stays current across all regions.
- The public `mode` property gates fullscreen toggling of the usage widgets, and restores the original regular-mode displays.
- Region invalidation still reaches borrowed native components.
- Verify that native `Image` output still uses Kitty (`\x1b_G`) or iTerm2 (`\x1b]1337;File=`) sequences. The compositor recognises these prefixes before text measurement and preserves complete output under the [image placement policy](../README.md#usage). Image geometry, identifiers, and terminal placement remain Pi-owned.

### Custom footer

- Verify custom-footer storage, reset order, and disposal of branch subscriptions.
- An existing custom footer prevents acquisition. A later replacement releases the coordinator, and cleanup doesn't overwrite it.

### Mouse dispatch

- Containers propagate the native `target` geometry and optional `focusTarget` for capture and focus (observed in Pi 0.99.2). Translating coordinates must not focus otherwise passive components.
- Forward each copy's render width, not the width of its hit area, because native containers validate cached child layout against the event width.
- A handled primary press keeps the usage widget's target across redraws until release, so Pi synthesises one click.

### Session lifecycle

- Verify the order of session shutdown, start, and reload.
- Shutdown releases adapters but doesn't dispose borrowed widgets; native UI reset owns disposal.
- A new start loads preferences and keeps no stale session components.

### Metrics

- `getSessionStats()` includes usage, tool-result, compaction, and branch-summary entries.
- The latest assistant prompt's usage sets the cache-hit percentage.
- `getContextUsage()` keeps unknown counts after compaction.
- It returns no usage when the effective model's window is unknown. Never render an unknown window as zero.
- `autoCompactionEnabled` is runtime state.
- `settingsManager.getCompactionReserveTokens(session.model)` returns the selected model's reserve for the verbose threshold, and can reject invalid settings.
- Pi's `_exceedsCompactionThreshold` and `_checkCompaction` combine the selected model's reserve with the physical window, even when the physical model has a different reserve configured.
- The label shows the selected model. Under a virtual selection it adds `session.routedModel`, the physical model and level of the latest successful response, as `→ id:level`.
- Check subscription reporting.
- Check thinking support.
- Check session names.
- Check home abbreviation.
- Check the native git branch representation.

## Limitations

- Mouse input works only in fullscreen mode. The usage widgets use `MouseRegion` to claim primary presses, and toggle on Pi's synthesised click without taking focus. Regular mode keeps the original non-interactive displays.
- A custom footer is exclusive, not composable. Contribute through native widgets and statuses, or disable the competing footer extension.
- On the verified version, a changed native host or renderer method can be accepted as an unknown wrapper; version evidence cannot distinguish them. On an unverified version, an unknown wrapper disables the coordinator until the contracts and version pin are reviewed.
- Both installed renderer implementations and the current renderer are checked at acquisition. Recheck replacement renderers before rebinding their private frame hook; unrelated later host-method replacements are outside the acquisition check.
- Copies share one native instance and render at the same terminal width. Mouse dispatch uses that width, not the compacted hit area. Drag capture after a later frame follows the component's most recent render geometry.
- Components expose `render(width)`, not a preferred size. Each placement renders once at terminal width, and the output it occupies sets its row width. Whole widgets wrap in order without shrinking, and a full-width component takes its own row. Widgets control wrapping inside their own output.
- While `/widgets` is open, the menu sizes itself from the unclipped region height, so tall regions still clip on short terminals.
- Shared rows trim only literal trailing spaces known not to paint or carry metadata. Backgrounds, decorated spaces, and unknown escape sequences keep their width. Leading indentation and singleton padding are kept.
- Pi's renderer already expands visible tabs to the three columns `visibleWidth()` uses. The extension must not rewrite tabs inside OSC or APC payloads.
- Automated fixtures use real Pi renderers and the native fullscreen dock, without startup downloads, process signal handlers, or a physical terminal. They don't establish visual quality for every component or terminal emulator.

When Pi adds a public registry, layout, mode-change, or renderer-lifecycle API, use it instead of the matching private hook. Replace the boundary and its tests together, without transitional adapters.
