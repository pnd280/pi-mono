# Pi compatibility for maintainers

[@pi-mono/libs](../README.md)

> Last verified against Pi 1.4.0 with a source review of the Pi 1.3.0 to 1.4.0 changes, the fingerprint check, package checks, and offline tests of the native-tools consumers in tool display and agent summary and the browser consumers in todo and prompt manager, and an offline tmux run of the prompt manager browser between the 19-row inline and 18-row overlay layouts, with input, selection, and editor focus kept after each remount and after the overlay closes. Not covered: live-provider schema acceptance; platform-specific checks; a resumed session with tool modifiers and [native observation](../../extensions/pi-tool-display/GLOSSARY.md#interpretation); and terminal checks of stacked extension dialogs over an inline custom view, literal-plus shortcuts, and the browser search cursor with `showHardwareCursor`.

## Upgrade procedure

1. Run the [package checks](../README.md#validation) and the linked component scenarios.
2. Run the affected extension consumers. Native observation changes need the display API and CLI suites. Fixtures must still run real offline Pi.
3. Work through the checklist below.
4. Update the "Last verified" line.

## Checklist

Check both API and installed-CLI consumers wherever a library depends on Pi's host implementation.

### Tool schemas

[Tool schemas](../src/tool-schema/README.md):

- [ ] Pi accepts the TypeBox parameters that `toToolSchema` projects from Zod input.
- [ ] Hidden metadata stays excluded after TypeBox composition.
- [ ] The projected parameters contain no integer bounds.
- [ ] Pi validates tool arguments against the projected parameters.
- [ ] Supported providers accept the documented profile.

### Native tools and mutations

[Native tools](../src/native-tools/README.md) and [mutations](../src/file-mutations/README.md) depend on these Pi host contracts:

- [ ] Pi constructs native tools through the API and the installed CLI with the `_buildRuntime` and `_refreshToolRegistry` methods that match the fingerprints in [`compatibility.ts`](../src/native-tools/compatibility.ts).
- [ ] Wrapped native tools keep their provenance, middleware, exposure, output schemas, and structured results.
- [ ] Pi's mutation queue keeps its ordering around the shared source capture.
- [ ] Borrowed definitions and results reach observers unchanged.
- [ ] Teardown restores only replacements that the library still owns.
- [ ] A nonzero bash exit resolves to an error result, and aborts and timeouts still reject.
- [ ] Reload activates newly added `defaultTools`.
- [ ] Reload keeps existing active tools when defaults are removed.
- [ ] Reload wraps surviving observers exactly once.

### TUI

The [shared TUI](../src/tui/README.md) depends on these Pi host contracts:

- [ ] The pi-tui public exports that the shared TUI imports still exist.
- [ ] Shared TUI layout, keybindings, images, and invalidation render as the component scenarios expect in the current Pi host.
- [ ] Responsive remounts keep the logical view.
- [ ] Closing an inline custom component removes only its own dialog, then shows the previous dialog or the editor and focuses it.
- [ ] An inline custom mount that closes before Pi shows it changes no focus.
- [ ] Disposal runs only on final closure.
- [ ] Pi's dispatcher still cannot dispatch the [rejected shortcuts](../src/tui/keybindings/README.md#behaviour), and it still matches a symbol binding against the Shift press that types the symbol.
- [ ] [Fullscreen routing](../src/tui/responsive-custom-ui/README.md#host-compatibility) still finds the [renderer contract](tui-fullscreen-input.md#renderer-contract) it depends on.
- [ ] Deferred installation puts the adapter's dispatcher first in `inputListeners`, before Pi's transcript listener, and the dispatcher then receives input first.
- [ ] When the renderer changes, the adapter finds the new `inputListeners` Set and moves its dispatcher there.
- [ ] While Pi has a pending overlay focus restore, the adapter does not take input from the overlay.
- [ ] Teardown removes only the adapter's dispatcher, and unrelated listeners stay in `inputListeners`.
- [ ] Unsupported routing is reported once per opening, without closing the view.

Recheck the shortcut item before you change shortcut validation or resolution.

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
- [ ] A `systemPrompt` result still makes Pi ignore `appendSystemPrompt`.
- [ ] Interactive mode sets up extension shortcuts and commands after `resources_discover`.
- [ ] Pi defers prompts sent during `agent_settled` until the emission ends.

The late shortcut and command setup lets [lifecycle claims](../src/lifecycle/phases.md#shortcut-claims) and the working-message command registered before it work. The deferred prompts keep the [run marks](../src/lifecycle/phases.md#run-marks) of one run apart from the next.

### Working message

After an upgrade, these [working message](../src/working-message/README.md) results hold:

- [ ] Among live participants and participants that can still become live, the one with the lowest `ownerRank` registers `/working-message`, with the tie-breaks and the left-out-factory case in the [command owner rules](../src/working-message/command-owner.md#command-owner).
- [ ] Stale or disposed handles cannot change a replacement's text.
- [ ] When no live component or override has text, Pi's default working message returns.
- [ ] Trusted project ordering overrides global ordering.
- [ ] Ordering saves lock the settings file and keep unrelated fields.

### Offline fixtures

- [ ] [Offline fixtures](../README.md#offline-validation) match the real provider message and stream contracts.
- [ ] Offline fixtures isolate authentication.
- [ ] Offline fixtures load the installed CLI.
- [ ] Offline fixtures accept the launcher flags.
- [ ] The [interactive host fixture](../src/validation/interactive-host/README.md) still finds the private containers, UI-context creation, renderer mounting, and `createChatViewport` it relies on.
- [ ] Pi focuses `editor` at startup before the renderer starts, as `inputHostFixture` does. Custom-UI tests depend on this focus.

## Limitations

The installed Pi 1.4.0 has these host behaviours:

- Native construction matches the recorded fingerprints.
- Transcript restoration also activates extension tools that the branch never added or removed. It reads only the names of `_baseToolDefinitions`, so native observation stays independent of it.
- An inline custom mount that closes before Pi shows it changes no focus. A responsive view at 18 rows mounts inline, moves to an overlay, and closes the inline mount in a microtask, so the overlay saves and restores the focus that existed before. The input-enabled `inputHostFixture` focuses the editor at startup, as Pi does.

These private dependencies could be replaced by public Pi APIs. None exists as of Pi 1.4.0.

- Replace the [private native-observation hooks](../src/native-tools/compatibility.ts) when Pi offers public native-observation APIs, and validate both the display and summary consumers. Pi 1.4.0 parity for `_buildRuntime` and `_refreshToolRegistry`: None. Pi would need a public hook that wraps or observes built-in tool definitions at construction and reload and keeps their `sourceInfo`.
- Replace private fullscreen routing when a public API offers input priority scoped to focus. Pi 1.4.0 parity for the `inputListeners` mutation: None. Check todo and prompt-manager paging through the installed CLI, and confirm that working-message menus in todo and agent-summary keep ordinary input routing.
- Revisit public contribution APIs for working-message [overwrites by non-participants](../src/working-message/README.md#behaviour).
- Adopt public TUI components that can replace a local implementation without losing controlled state or cancellation.
