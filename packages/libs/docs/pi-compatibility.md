# Pi compatibility

[@pi-mono/libs](../README.md)

## Contracts to verify

- [ ] [Native tools](../src/native-tools/README.md) and [mutations](../src/file-mutations/README.md): API/CLI construction, provenance, middleware, queue ordering, borrowed data, shared capture, and conditional teardown.
- [ ] [TUI](../src/tui/README.md): public exports, layout/keybindings, images, invalidation, responsive remounts, editor restoration, and disposal.
- [ ] [Working message](../src/working-message/README.md): event-bus ownership, stale handles, defaults, trusted settings precedence, locking, and preservation of unrelated fields.
- [ ] [Offline fixtures](../README.md#offline-validation): actual provider message/stream contracts, authentication isolation, installed-CLI loading, and launcher flags.

## Limitations and replacement opportunities

- Revisit public native-observation APIs to retire [private construction hooks](../src/native-tools/compatibility.ts); validate both display and summary consumers.
- Revisit public contribution APIs for [nonparticipant overwrites](../src/working-message/README.md#behavior), and TUI components that can replace local implementation without losing controlled state or cancellation.
- New clipboard/storage helpers must preserve [native-only transport](../src/native-clipboard/README.md) and [private-file guarantees](../src/private-files/README.md).

## Validation

Use [package checks](../README.md#validation) and linked component scenarios, then affected extension consumers. Native observation requires display API/CLI coverage; fixtures must still run real offline Pi.
