# Temporary property hooks

[Library index](../../README.md#usage)

Temporarily replace object properties and restore only replacements this library still owns.

## Behaviour

[`@pi-mono/libs/owned-hooks`](index.ts) exports `OwnedHooks` for temporary property replacements and `unwrapHook` for inspecting their recorded predecessors.

`restore()` reverses replacements only where the installed value remains, restoring descriptors or removing new properties. Unrestorable properties are skipped without throwing. Held callback references cannot be revoked.

When `replace()` installs a function, it records the preceding data-property value. `unwrapHook(value)` follows those recorded links across module reloads and after `restore()` to the deepest value without changing the binding. It stops at an unrecorded value and returns `undefined` for a cycle, an ambiguous reused function, or an accessor predecessor. It does not invoke getters.

The records use weak function keys in a process-global `Symbol.for` registry because Pi reloads extension modules without a shared module cache. Restoration keeps the records: a later wrapper can still retain a disposed wrapper.

## Caller responsibilities

Verify host compatibility before replacement. Existing own properties must be writable data properties; otherwise `replace()` throws `TypeError`.

Use a fresh wrapper for each predecessor. Provenance records the replaced value; it does not prove that a wrapper calls it or preserves its behaviour. An unrecorded callable can be a native method or an unknown wrapper, so this result alone cannot distinguish a native fingerprint mismatch from an incomplete chain. The caller supplies compatibility evidence, such as reviewed source hashes or a public-version pin; the registry does not approve hooks.

Tool display and editor widgets apply the [host fingerprint policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints): accept a callable endpoint with a reviewed hash, or an unknown hash when Pi's public `VERSION` matches the owner's inspected pin. On an unverified version, an unknown wrapper disables the gated feature until the pin is reviewed. A changed native method on the verified version can be accepted as an unknown wrapper; this is the policy's limit.

Deactivate retained callbacks before calling `restore()`. Tool display's [installer](../../../extensions/pi-tool-display/src/host/install.ts) and [display collectors](../../../extensions/pi-tool-display/src/host/collection.ts) manage this teardown order.
