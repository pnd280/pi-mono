# Temporary property hooks

[Library index](../../README.md#usage)

An extension that temporarily replaces properties on host objects must restore them without undoing a replacement that another extension installed later. [`@pi-mono/libs/owned-hooks`](index.ts) exports `OwnedHooks` for temporary property replacements and `unwrapHook` for inspecting their recorded predecessors.

## Behaviour

### Restoration

- `restore()` reverses a replacement only where the installed value remains. It restores the descriptor, or removes a property that the replacement added.
- `restore()` skips unrestorable properties without throwing.
- Held callback references cannot be revoked.

### Provenance

When `replace()` installs a function, it records the preceding data-property value.

- `unwrapHook(value)` follows those recorded links to the deepest value without changing the binding. It works across module reloads and after `restore()`.
- It stops at an unrecorded value.
- It returns `undefined` for a cycle, an ambiguous reused function, or an accessor predecessor.
- It does not call getters.

The records use weak function keys in a process-global `Symbol.for` registry because Pi reloads extension modules without a shared module cache. Restoration keeps the records, because a later wrapper can still retain a disposed wrapper.

Provenance records the replaced value. It does not prove that a wrapper calls it or preserves its behaviour. An unrecorded callable can be a native method or an unknown wrapper, so this result alone cannot distinguish a native fingerprint mismatch from an incomplete chain. The registry does not approve hooks.

### Host fingerprints

Tool display and editor widgets apply the [host fingerprint policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints). They accept a callable endpoint with a reviewed hash, or an unknown hash when Pi's public `VERSION` matches the owner's inspected pin. On an unverified version, an unknown wrapper disables the gated feature until the pin is reviewed. On the verified version, a changed native method can be accepted as an unknown wrapper; this is the limit of the policy.

## Caller responsibilities

- Deactivate retained callbacks before you call `restore()`.
- Verify host compatibility before replacement. Supply compatibility evidence, such as reviewed source hashes or a public-version pin.
- Make sure that existing own properties are writable data properties. Otherwise `replace()` throws `TypeError`.
- Use a fresh wrapper for each predecessor.

Related: tool display's [installer](../../../extensions/pi-tool-display/src/host/install.ts) and [display collectors](../../../extensions/pi-tool-display/src/host/collection.ts) manage the teardown order.
