# Hook provenance and host fingerprints

[Temporary property hooks](README.md)

Read this when you use `unwrapHook` results to decide whether a host method is safe to replace.

## Provenance records

The records use weak function keys in a process-global `Symbol.for` registry because Pi reloads extension modules without a shared module cache. Restoration keeps the records, because a later wrapper can still retain a disposed wrapper.

## What provenance proves

Provenance records the replaced value. It does not prove that a wrapper calls it or preserves its behaviour. An unrecorded callable can be a native method or an unknown wrapper, so this result alone cannot distinguish a native fingerprint mismatch from an incomplete chain. The registry does not approve hooks.

## Host fingerprints

Tool display and editor widgets apply the [host fingerprint policy](../../../../.agents/skills/pi-update/references/compatibility-checks.md#host-fingerprints).
