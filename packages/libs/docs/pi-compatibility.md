# Pi compatibility

[@pi-mono/libs](../README.md)

## Contracts to verify

- [ ] [Tool schemas](../src/tool-schema/README.md): Zod input projection, hidden-metadata exclusion after TypeBox composition, integer-bound removal, Pi argument validation, and supported-provider acceptance of the documented profile.
- [ ] [Native tools](../src/native-tools/README.md) and [mutations](../src/file-mutations/README.md): API/CLI construction, provenance, middleware, exposure/output schemas, structured results, queue ordering, borrowed data, shared capture, and conditional teardown. Bash nonzero exits resolve error results; aborts and timeouts still reject. Reload must preserve native activation of newly added `defaultTools`, retain existing active tools when defaults are removed, and wrap surviving observers exactly once.
- [ ] [TUI](../src/tui/README.md): public exports, layout/keybindings, images, invalidation, responsive remounts, editor restoration, and disposal.
- [ ] [Fullscreen routing](../src/tui/responsive-custom-ui/README.md#host-compatibility): an ordered `inputListeners` Set with callable entries, plus `getFocusedComponent()` and `getVisibleOverlayFocusRestore()` through the stable TUI proxy. Verify deferred installation, renderer rebinding, focus handoff, and listener-preserving teardown. Unsupported routing must report once per opening without closing the view.
- [ ] [Working message](../src/working-message/README.md): event-bus ownership, stale handles, defaults, trusted settings precedence, locking, and preservation of unrelated fields.
- [ ] [Offline fixtures](../README.md#offline-validation): actual provider message/stream contracts, authentication isolation, installed-CLI loading, and launcher flags. The [interactive host fixture](../src/validation/interactive-host/README.md) also relies on private containers, UI-context creation, renderer mounting, and `createChatViewport`.

## Limitations and replacement opportunities

- Revisit public native-observation APIs to retire [private construction hooks](../src/native-tools/compatibility.ts); validate both display and summary consumers.
- Replace private fullscreen routing when a public API provides equivalent focus-scoped input priority. Check todo and prompt-manager paging through the installed CLI, and confirm that working-message menus in todo and agent-summary retain ordinary input routing.
- Revisit public contribution APIs for [nonparticipant overwrites](../src/working-message/README.md#behavior), and TUI components that can replace local implementation without losing controlled state or cancellation.
- New clipboard/storage helpers must preserve [native-only transport](../src/native-clipboard/README.md) and [private-file guarantees](../src/private-files/README.md).

## Validation

Pi **0.99.2** workspace checks and offline tests passed, together with all extension consumers. Native registry API/CLI fingerprints are unchanged. Real-host tests preserve added and removed `defaultTools` across reload without duplicating observation; display API/CLI and summary suites passed. Native unit fixtures use the complete public [tool context](../src/validation/tool-context/README.md). Live-provider schema acceptance, native clipboard delivery, and platform-specific checks were not run.

Use [package checks](../README.md#validation) and linked component scenarios, then affected extension consumers. Native observation requires display API/CLI coverage; fixtures must still run real offline Pi.
