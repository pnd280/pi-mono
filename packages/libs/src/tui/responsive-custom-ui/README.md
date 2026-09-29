# Responsive custom UI

[Shared TUI](../README.md#usage)

## Behavior

[`openResponsiveCustomUI`](index.ts) preserves one component across inline/overlay remounts, calling optional `dispose()` only at final closure.

### Fullscreen input ownership

A component may provide synchronous, side-effect-free `ownsFullscreenInput(data): boolean` alongside `handleInput`. In a focused fullscreen inline presentation, owned presses reach that presentation's handler once, before Pi's transcript listener. **Other extension listeners do not receive consumed input.** Unclaimed input follows the original listener chain.

Regular mode, overlays, and components without ownership use ordinary host routing. Search overlays and other focused dialogs suspend the inline view's ownership. The working-message ordering menu does not opt in.

### Host compatibility

The private [adapter](fullscreen-input.ts) depends on Pi 0.87's renderer contract:

- An ordered `inputListeners` Set with callable entries. Installation must not reorder the Set during traversal (which could deliver input twice).
- `getFocusedComponent()` and `getVisibleOverlayFocusRestore()` to avoid intercepting dialog input, including during focus restoration.
- Property reads through the stable TUI proxy, whose descriptors may be replaced independently of the current renderer.

Registrations belong to host presentations, not the logical component retained across remounts; cleanup must preserve unrelated listeners.

Missing capabilities or detected interference disable routing and call `onInputRoutingUnavailable` once per opening. The view stays open with ordinary host delivery. Arbitrary third-party input patches are unsupported.

Public terminal listeners append after Pi's fullscreen transcript listener and cannot preempt it. Replace this adapter when a public API provides equivalent focus-scoped priority.

## Caller responsibilities

Supply the [host options](index.ts). Use `onTransition` to cancel context-dependent actions such as [timed confirmation](../../timed-confirmation/README.md) on remount.

Ownership opt-in requires `onInputRoutingUnavailable()`. Supply a consumer-specific warning and fallback controls. Derive ownership from the same injected keybindings and action precedence as input dispatch; do not register listeners or mutate host input state in components.

Await closure before editor changes: Pi restores the opening snapshot on inline closure. The [browser host](../open-browser/README.md) provides `afterClose` and redraws.

## Validation

Use the [package checks](../../../README.md#validation). [Routing tests](fullscreen-input.test.ts) exercise real-renderer input, focus handoff, listener interference, and renderer replacement; [lifetime tests](lifetime.test.ts) cover cancellation and disposal. Check browser remounts and editor restoration in the [browser host tests](../open-browser/index.test.ts), and run the [terminal scenarios](../../../../extensions/pi-prompt-manager/docs/validation.md#fullscreen-paging).
