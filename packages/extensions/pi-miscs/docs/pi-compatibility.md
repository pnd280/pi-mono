# Pi compatibility

[pi-miscs](../README.md)

## Contracts to verify

- [ ] Pi discovers [index.ts](../index.ts) through `pi.extensions` in [package.json](../package.json) and follows its default re-export.
- [ ] Pi accepts the default factory in [src/index.ts](../src/index.ts) with the public `ExtensionAPI` type.
- [ ] Add each bundled extension's host contracts here when behavior is introduced.

## Limitations and replacement opportunities

Pi sees one extension entry point for the bundle, so package resource filters cannot toggle its individual registrations. Move a feature to its own package if it needs independent loading. The scaffold has no private Pi API dependencies or host workarounds.

## Validation

Run [package checks](../README.md#validation). After adding behavior or upgrading Pi, load the package in an offline Pi session and verify startup and `/reload` without duplicate registrations or resource leaks.
