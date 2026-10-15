# Temporary property hooks

[Library index](../../README.md#usage)

Temporarily replace object properties and restore only replacements this library still owns.

## Behaviour

[`@pi-mono/libs/owned-hooks`](index.ts) exports `OwnedHooks` for temporary property replacements.

`restore()` reverses replacements only where the installed value remains, restoring descriptors or removing new properties. Unrestorable properties are skipped without throwing. Held callback references cannot be revoked.

## Caller responsibilities

Verify host compatibility before replacement. Existing own properties must be writable data properties; otherwise `replace()` throws `TypeError`.

Deactivate retained callbacks before calling `restore()`. Tool display's [installer](../../../extensions/pi-tool-display/src/host/install.ts) and [native registry](../../../extensions/pi-tool-display/src/host/native-registry.ts) manage this teardown order.
