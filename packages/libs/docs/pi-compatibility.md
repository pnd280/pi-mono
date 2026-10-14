# Pi compatibility for maintainers

[@pi-mono/libs](../README.md)

> Last verified against Pi 1.0.2 (workspace checks and offline tests, with all extension consumers; native-construction fingerprints unchanged in the API and bundled CLI). Not covered: live-provider schema acceptance, native clipboard delivery, and platform-specific checks.

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

[Native tools](../src/native-tools/README.md) and [mutations](../src/file-mutations/README.md):

- [ ] Construction through the API and CLI, provenance, middleware, exposure and output schemas, and structured results.
- [ ] Queue ordering, borrowed data, shared capture, and conditional teardown.
- [ ] A nonzero bash exit resolves to an error result; aborts and timeouts still reject.
- [ ] Reload activates newly added `defaultTools`. Existing active tools are kept when defaults are removed, and surviving observers are wrapped exactly once.

### TUI

- [ ] [TUI](../src/tui/README.md) public exports, layout and keybindings, images, invalidation, responsive remounts, editor restoration, and disposal.
- [ ] Recheck the [rejected shortcuts](../src/tui/keybindings/README.md#behaviour) against Pi's dispatcher before changing validation.
- [ ] [Fullscreen routing](../src/tui/responsive-custom-ui/README.md#host-compatibility) needs an ordered `inputListeners` Set of callable entries, plus `getFocusedComponent()` and `getVisibleOverlayFocusRestore()` through the stable TUI proxy.
- [ ] Deferred installation, renderer rebinding, focus handoff, and teardown that keeps listeners all work.
- [ ] Unsupported routing is reported once per opening, without closing the view.

### Cooperative search

- [ ] [Internal ranking](../src/text-search/README.md#validation) retains Pi-compatible fuzzy scores, including Unicode positions and letter/digit transposition fallback. Compare `fuzzyScore` in [ranking](../src/text-search/ranking.ts) with `fuzzyMatch` in the installed `@earendil-works/pi-tui` (`dist/fuzzy.js`).

### Working message

- [ ] [Working message](../src/working-message/README.md) event-bus ownership, stale handles, and defaults.
- [ ] Trusted settings precedence, locking, and preservation of unrelated fields.

### Offline fixtures

- [ ] [Offline fixtures](../README.md#offline-validation) match the real provider message and stream contracts, isolate authentication, load the installed CLI, and accept the launcher flags.
- [ ] The [interactive host fixture](../src/validation/interactive-host/README.md) still finds the private containers, UI-context creation, renderer mounting, and `createChatViewport` it relies on.

## Limitations

These private dependencies could be replaced by public Pi APIs:

- **Native observation.** Replace the [private construction hooks](../src/native-tools/compatibility.ts) when Pi offers public native-observation APIs, and validate both the display and summary consumers.
- **Fullscreen routing.** Replace private routing when a public API offers input priority scoped to focus. Check todo and prompt-manager paging through the installed CLI, and confirm that working-message menus in todo and agent-summary keep ordinary input routing.
- **Contributions.** Revisit public contribution APIs for [overwrites by non-participants](../src/working-message/README.md#behaviour).
- **TUI components.** Adopt public components that can replace a local implementation without losing controlled state or cancellation.

New clipboard and storage helpers must keep [native-only transport](../src/native-clipboard/README.md) and the [private-file guarantees](../src/private-files/README.md).
