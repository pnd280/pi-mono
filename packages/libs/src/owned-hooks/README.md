# Temporary property hooks

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/owned-hooks`](index.ts) exports `OwnedHooks` for temporary property replacements.

`restore()` processes replacements in reverse order, changing only properties that still contain the installed value. It restores original descriptors or removes newly introduced properties. If a property can no longer be restored, it skips that property without throwing.

Restoring a property cannot revoke callback references held elsewhere.

## Caller responsibilities

Verify host compatibility before replacement. Existing own properties must be writable data properties.

Deactivate retained callbacks before calling `restore()`. Tool display's [installer](../../../extensions/pi-tool-display/src/host/install.ts) and [native registry](../../../extensions/pi-tool-display/src/host/native-registry.ts) manage this teardown order.

## Validation

Use the [package validation commands](../../README.md#validation).
