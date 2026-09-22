# Responsive custom UI

[Shared TUI](../README.md#usage)

## Behavior

[`openResponsiveCustomUI`](index.ts) (`@pi-mono/libs/tui/responsive-custom-ui`) preserves one component across inline/overlay remounts, calling optional `dispose()` only at final closure.

### Fullscreen input ownership

A component may provide synchronous, side-effect-free `ownsFullscreenInput(data): boolean` alongside `handleInput`. In a focused fullscreen inline presentation, owned presses reach that presentation's handler once, before Pi's transcript listener. **Other extension listeners do not receive consumed input.** Unclaimed input follows the original listener chain.

Todo and browser views reserve only configured paging actions that survive their normal action precedence, including at scroll boundaries or while navigation is temporarily ignored. Releases do not navigate; each repeat dispatches once.

Regular mode, overlays, and components without ownership use ordinary host routing. Search overlays and other focused dialogs suspend the inline view's ownership. The working-message ordering menu does not opt in.

### Host compatibility

The private [adapter](fullscreen-input.ts) depends on Pi 0.87's renderer contract:

- An ordered `inputListeners` Set with callable entries. Installation runs in a microtask because reordering a Set during traversal can deliver input twice. One dispatcher per collection preserves existing listeners and their relative order.
- `getFocusedComponent()` and `getVisibleOverlayFocusRestore()`. The second query prevents routing to an inline view while Pi is about to restore overlay focus.
- Property reads through the stable TUI proxy. Descriptor replacements may target the proxy instead of its current renderer.

Registrations belong to host presentations, not the logical component retained across remounts. They deactivate synchronously on closure or remount and rebind when the renderer changes. Cleanup removes only owned registrations and dispatchers, preserving unrelated listener changes.

Missing capabilities or detected interference disable routing and call `onInputRoutingUnavailable` once per opening. The view stays open with ordinary host delivery; mounting policies and keybindings remain unchanged. The adapter does not compete with extensions that remove, reorder, or copy its dispatcher. Arbitrary third-party input patches are unsupported.

Public terminal listeners append after Pi's fullscreen transcript listener and cannot preempt it. Replace this adapter when a public API provides equivalent focus-scoped priority.

## Caller responsibilities

Supply a UI object with `custom`, a component factory, a cancellation signal, sizing, and transition policy. Use `onTransition` for actions such as cancelling a [timed confirmation](../../timed-confirmation/README.md) when the mounting context changes.

Ownership opt-in requires `onInputRoutingUnavailable()`. Supply a consumer-specific warning and fallback controls. Derive ownership from the same injected keybindings and action precedence as input dispatch; do not register listeners or mutate host input state in components.

Await closure before editor changes: Pi restores the opening snapshot on inline closure. The [browser host](../open-browser/README.md) provides `afterClose` and redraws.

## Validation

Use the [package checks](../../../README.md#validation). [Routing tests](fullscreen-input.test.ts) exercise real-renderer input, focus handoff, listener interference, and renderer replacement; [lifetime tests](lifetime.test.ts) cover cancellation and disposal. Check browser remounts and editor restoration in the [browser host tests](../open-browser/index.test.ts), and run the [terminal scenarios](../../../../extensions/pi-prompt-manager/docs/validation.md#fullscreen-paging).
