# Responsive custom UI

[Shared TUI](../README.md#usage)

A view that switches between inline and overlay presentations loses its state if each presentation builds a new component. Use [`openResponsiveCustomUI`](index.ts) to keep one component across those remounts.

## Behaviour

`openResponsiveCustomUI` preserves one component across remounts and calls its optional `dispose()` only at final closure.

### Fullscreen input ownership

A component may provide synchronous, side-effect-free `ownsFullscreenInput(data): boolean` alongside `handleInput`. In a focused fullscreen inline presentation, owned presses reach that presentation's handler once, before Pi's transcript listener. Other extension listeners do not receive consumed input. Unclaimed input follows the original listener chain.

Regular mode, overlays, and components without ownership use ordinary host routing. Search overlays and other focused dialogs suspend the inline view's ownership. The working-message ordering menu does not opt in.

Opening a component that opts in to input ownership throws when the caller supplies no `onInputRoutingUnavailable()`.

### Host compatibility

Priority routing depends on internal Pi renderer properties, because public terminal listeners cannot preempt Pi's transcript listener. Missing capabilities or detected interference disable routing and call `onInputRoutingUnavailable` once per opening. The view stays open with ordinary host delivery. Arbitrary third-party input patches are unsupported.

When you change the private [adapter](fullscreen-input.ts) or upgrade Pi, check the [renderer contract and registration lifetime](../../../docs/tui-fullscreen-input.md).

## Usage

```ts
import { browserLayout } from "@pi-mono/libs/tui/components/browser/layout";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";

await openResponsiveCustomUI({
  ui,
  signal,
  onInputRoutingUnavailable: () =>
    ui.notify(
      "Todo fullscreen input routing is unavailable on this host. Use regular mode if controls do not respond.",
      "warning"
    ),
  useOverlay: (tui) => tui.mode !== "fullscreen" && browserLayout(tui.terminal.rows).overlay,
  overlayOptions: { width: "100%", anchor: "center" },
  create: (tui, theme, keybindings, done) => new TodosView({ tui, theme, keybindings, done })
});
```

## Caller responsibilities

- Supply the [host options](index.ts).
- Use `onTransition` to cancel context-dependent actions such as [timed confirmation](../../timed-confirmation/README.md) on remount.
- When a component opts in to input ownership, supply `onInputRoutingUnavailable()` with a consumer-specific warning and fallback controls.
- Derive ownership from the same injected keybindings and action precedence as input dispatch.
- Do not register listeners or mutate host input state in components.
- Await closure before editor changes, because Pi restores the opening snapshot on inline closure.

Related: the [browser host](../open-browser/README.md) provides `afterClose` and redraws.

## Validation

Use the [package checks](../../../README.md#validation). [Routing tests](fullscreen-input.test.ts) exercise real-renderer input, focus handoff, listener interference, and renderer replacement. [Lifetime tests](lifetime.test.ts) cover cancellation and disposal. Check browser remounts and editor restoration in the [browser host tests](../open-browser/index.test.ts), and run the [terminal scenarios](../../../../extensions/pi-prompt-manager/docs/validation.md#fullscreen-paging).
