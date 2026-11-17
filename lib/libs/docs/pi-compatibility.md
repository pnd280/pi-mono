# Pi compatibility for maintainers

[@pi-mono/libs](../README.md)

> Last verified against Pi 1.5.2 with a source review of the Pi 1.5.1 to 1.5.2 changes, the fingerprint check, package checks, and offline tests of the TUI and keybinding consumers. Not covered: the probe of Pi's argument validation against a projected tool schema, which last ran on Pi 1.5.1; the randomised comparison of text preview layout with `wrapTextWithAnsi`, which last ran on Pi 1.5.0; live-provider schema acceptance; platform-specific checks; a resumed session with tool modifiers and [native observation](../../extensions/pi-tool-display/GLOSSARY.md#interpretation); and all terminal checks, including the fullscreen remount of the prompt manager browser, stacked extension dialogs over an inline custom view, an open overlay view at `/reload`, modified function keys, literal-plus shortcuts, and the browser search cursor with `showHardwareCursor`.

## Upgrade procedure

Run the presentation scenarios that the [shared TUI validation](../src/tui/README.md#validation) lists.

## Checklist

Check both API and installed-CLI consumers wherever a library depends on Pi's host implementation.

### Tool schemas

After an upgrade, these [tool schema](../src/tool-schema/README.md) results hold:

- [ ] Pi accepts the TypeBox parameters that `toToolSchema` projects from Zod input.
- [ ] Hidden metadata stays excluded after TypeBox composition.
- [ ] The projected parameters contain no integer bounds.
- [ ] Pi validates tool arguments against the projected parameters.
- [ ] Supported providers accept the documented profile.

### TUI

The [shared TUI](../src/tui/README.md) depends on these Pi host contracts:

- [ ] The pi-tui public exports that the shared TUI imports still exist.
- [ ] Shared TUI layout, keybindings, images, and invalidation render as the presentation scenarios expect in the current Pi host.
- [ ] Responsive remounts keep the logical view.
- [ ] Closing an inline custom component removes only its own dialog, then shows the previous dialog or the editor and focuses it.
- [ ] An inline custom mount that closes before Pi shows it changes no focus.
- [ ] Disposal runs only on final closure.
- [ ] A UI reset at `/reload` or session replacement calls `dispose()` on every open custom component, inline or overlay.
- [ ] Pi's dispatcher still cannot dispatch the [rejected shortcuts](../src/tui/keybindings/README.md#behaviour), and it still matches a symbol binding against the Shift press that types the symbol.
- [ ] [Fullscreen routing](../src/tui/responsive-custom-ui/README.md#host-compatibility) still finds the [renderer contract](tui-fullscreen-input.md#renderer-contract) it depends on.
- [ ] Deferred installation puts the adapter's dispatcher first in `inputListeners`, before Pi's transcript listener, and the dispatcher then receives input first.
- [ ] When the renderer changes, the adapter finds the new `inputListeners` Set and moves its dispatcher there.
- [ ] While Pi has a pending overlay focus restore, the adapter does not take input from the overlay.
- [ ] Teardown removes only the adapter's dispatcher, and unrelated listeners stay in `inputListeners`.
- [ ] Unsupported routing is reported once per opening, without closing the view.

### Coordinators

The [coordinator protocol](../src/coordination/README.md) depends on these Pi host contracts:

- [ ] Event-bus listeners run synchronously during `pi.events.emit`.
- [ ] A failed factory loses its load-time bus subscriptions, and its `pi.events.emit` throws.
- [ ] A replaced or reloaded runtime removes its subscriptions, and its `pi.events.emit` throws.
- [ ] The project-trust pass can run a factory and then leave its extension out without discarding it. Its bus subscriptions stay, and Pi runs none of its handlers.
- [ ] Each emission creates one context and passes it to every handler of that emission.
- [ ] `input` and `before_agent_start` build a new event object for each handler.
- [ ] `session_shutdown`, `agent_start`, and `agent_settled` build one new event object for each emission.
- [ ] Every bind emits the session's stored `session_start` event. RPC binds a replaced session twice, so two emissions receive the same event object.
- [ ] Every bind and `/reload` emits `resources_discover` after all `session_start` handlers, when any extension has a `resources_discover` handler.
- [ ] `input` and `before_agent_start` keep the chain and error semantics that [input-chain](../src/input-chain/README.md#behaviour) and [prompt-parts](../src/prompt-parts/README.md#behaviour) copy.
- [ ] `before_agent_start`, for both user and custom-message runs, exposes a writable `systemPromptOptions.appendSystemPrompt` that holds Pi's append text and earlier extensions' changes.
- [ ] Pi builds new `systemPromptOptions` from its loaded append text for each run.
- [ ] A `systemPrompt` result still makes Pi ignore `appendSystemPrompt`.
- [ ] Interactive mode sets up extension shortcuts and commands after `resources_discover`.
- [ ] Pi defers prompts sent during `agent_settled` until the emission ends.

The late shortcut and command setup lets [lifecycle claims](../src/lifecycle/phases.md#shortcut-claims) and the working-message command registered before it work. The deferred prompts keep the [run marks](../src/lifecycle/phases.md#run-marks) of one run apart from the next. If Pi reused `systemPromptOptions` across runs, the additions would build up.

### Working message

After an upgrade, these [working message](../src/working-message/README.md) results hold:

- [ ] Among live participants and participants that can still become live, the one with the lowest `ownerRank` registers `/working-message`, with the tie-breaks and the left-out-factory case in the [command owner rules](../src/working-message/command-owner.md#command-owner).
- [ ] Stale or disposed handles cannot change a replacement's text.
- [ ] When no live component or override has text, Pi's default working message returns.
- [ ] Trusted project ordering overrides global ordering.
- [ ] Ordering saves lock the settings file and keep unrelated fields.

### Offline fixtures

The [offline fixtures](../README.md#offline-validation) depend on these Pi contracts:

- [ ] Offline fixtures match the real provider message and stream contracts.
- [ ] Offline fixtures isolate authentication.
- [ ] The [process fixture](../src/validation/pi-process/README.md) launches the executable in the installed Pi package's `bin.pi`.
- [ ] Pi accepts the flags that offline launches pass, including `--offline`, `--approve`, and the terminal launcher's `--tui-mode regular` and `--tui-mode fullscreen`.
- [ ] The [interactive host fixture](../src/validation/interactive-host/README.md) still finds the private containers, UI-context creation, renderer mounting, autocomplete setup, and `createChatViewport` it relies on.
- [ ] Pi focuses `editor` at startup before the renderer starts, as `inputHostFixture` does. Custom-UI tests depend on this focus.

## Limitations

The installed Pi 1.5.2 has these host behaviours:

- Pi validates tool arguments with `@earendil-works/pi-schema` after it coerces them. It converts strings to numbers, wraps a single value in an array, and drops `null` in an optional property that rejects `null`. Validation messages name the field, as in `- path: missing`. Projected schemas keep working, and a nullable optional field keeps an explicit `null`.
- Pi 1.5.2 can replace the editor while an extension dialog is open, and shows the new editor when the last dialog closes. `ctx.ui.custom()` accepts a `blocked` option for the waiting status, for inline components and for overlays. The [responsive custom UI](../src/tui/responsive-custom-ui/README.md) does not pass it.
- Text wrapping closes strikethrough before padding and keeps style-closing codes on the preceding row when it discards whitespace. Active styling still continues on the next row. Text preview layout still gives the same rows as `wrapTextWithAnsi`.
- A responsive view at 18 rows mounts inline, moves to an overlay, and closes the inline mount in a microtask, so the overlay saves and restores the focus that existed before.
- A UI reset at `/reload` or session replacement does not settle the `ctx.ui.custom()` promise of a component that it disposes. The responsive custom UI calls `done()` from that `dispose()`, so its view closes in either presentation.
- On quit, Pi aborts an active run and waits for it to settle before it emits `session_shutdown`, as it does on session replacement. The run's `agent_settled` handlers, which receive `aborted: true`, therefore run before the [shutdown revoke](../src/lifecycle/phases.md#shutdown-phase).

These private dependencies could be replaced by public Pi APIs. None exists as of Pi 1.5.2, except the partial counterpart for fullscreen routing below.

- Replace private fullscreen routing when a public API offers input priority scoped to focus. Pi 1.5.2 has the `capturesViewportInput` component property: while a component with it has focus, the fullscreen renderer passes its `tui.altScreen.*` scrolling and prompt keys to that component. It does not pass the `tui.altScreen.search` keys, and other extensions' input listeners still receive input before the component, so it does not yet replace the `inputListeners` mutation. Check todo and prompt-manager paging through the installed CLI, and confirm that working-message menus in todo and agent-summary keep ordinary input routing.
- Revisit public contribution APIs for working-message [overwrites by non-participants](../src/working-message/README.md#behaviour).
- Adopt public TUI components that can replace a local implementation without losing controlled state or cancellation.
