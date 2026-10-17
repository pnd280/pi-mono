# Pi compatibility for maintainers

[@pi-mono/libs](../README.md)

> Last verified against Pi 1.3.0 (package checks and offline tests, with native-tools consumers in tool display and agent summary and browser consumers in todo and prompt manager). Not covered: live-provider schema acceptance, platform-specific checks, a resumed session with tool modifiers and [native observation](../../extensions/pi-tool-display/GLOSSARY.md#interpretation), and terminal checks of overlay closure, literal-plus shortcuts, and the browser search cursor with `showHardwareCursor`.

## Upgrade procedure

1. Run the [package checks](../README.md#validation) and the linked component scenarios.
2. Run the affected extension consumers. Native observation changes need the display API and CLI suites. Fixtures must still run real offline Pi.
3. Work through the checklist below.
4. Update the "Last verified" line.

## Checklist

Check both API and installed-CLI consumers wherever a library depends on Pi's host implementation.

### Tool schemas

[Tool schemas](../src/tool-schema/README.md):

- [ ] Zod input projection.
- [ ] Hidden metadata stays excluded after TypeBox composition.
- [ ] Integer bounds are removed.
- [ ] Pi validates arguments, and supported providers accept the documented profile.

### Native tools and mutations

Pi 1.3.0 retains the native-construction fingerprints from 1.2.0. Native observation is independent of transcript tool-loadout restoration on resume, added in 1.3.0.

Check [native tools](../src/native-tools/README.md) and [mutations](../src/file-mutations/README.md):

- [ ] Construction through the API and CLI, provenance, middleware, exposure and output schemas, and structured results.
- [ ] Queue ordering, borrowed data, shared capture, and conditional teardown.
- [ ] A nonzero bash exit resolves to an error result; aborts and timeouts still reject.
- [ ] Reload activates newly added `defaultTools`. Existing active tools are kept when defaults are removed, and surviving observers are wrapped exactly once.

### TUI

In Pi 1.3.0, custom-UI fixtures hide only their own overlay handle, matching the host. Responsive custom UI calls `done()` without waiting for its overlay to mount.

- [ ] [TUI](../src/tui/README.md) public exports, layout and keybindings, images, invalidation, responsive remounts, editor restoration, and disposal.
- [ ] Recheck the [rejected shortcuts](../src/tui/keybindings/README.md#behaviour) and the Shift-symbol overlap rule against Pi's dispatcher before changing validation or resolution.
- [ ] [Fullscreen routing](../src/tui/responsive-custom-ui/README.md#host-compatibility) still finds the [renderer contract](tui-fullscreen-input.md#renderer-contract) it depends on.
- [ ] Deferred installation, renderer rebinding, focus handoff, and teardown that keeps listeners all work.
- [ ] Unsupported routing is reported once per opening, without closing the view.

### Working message

- [ ] [Working message](../src/working-message/README.md) event-bus ownership, stale handles, and defaults.
- [ ] Trusted settings precedence, locking, and preservation of unrelated fields.

### Offline fixtures

- [ ] [Offline fixtures](../README.md#offline-validation) match the real provider message and stream contracts, isolate authentication, load the installed CLI, and accept the launcher flags.
- [ ] The [interactive host fixture](../src/validation/interactive-host/README.md) still finds the private containers, UI-context creation, renderer mounting, and `createChatViewport` it relies on.

## Limitations

These private dependencies could be replaced by public Pi APIs. Pi 1.3.0 adds none: its extension types, extension and TUI docs, and pi-tui are unchanged from 1.2.0.

- Replace the [private native-observation hooks](../src/native-tools/compatibility.ts) when Pi offers public native-observation APIs, and validate both the display and summary consumers.
- Replace private fullscreen routing when a public API offers input priority scoped to focus. Check todo and prompt-manager paging through the installed CLI, and confirm that working-message menus in todo and agent-summary keep ordinary input routing.
- Revisit public contribution APIs for working-message [overwrites by non-participants](../src/working-message/README.md#behaviour).
- Adopt public TUI components that can replace a local implementation without losing controlled state or cancellation.

New storage helpers must keep the [private-file guarantees](../src/private-files/README.md).
