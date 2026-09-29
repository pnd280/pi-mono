# Pi compatibility

[pi-miscs](../README.md)

Pi sees one entry point ([package.json](../package.json), [index.ts](../index.ts)), so package filters cannot toggle individual registrations. Move features needing independent loading to their own package. The empty factory in [src/index.ts](../src/index.ts) has no private Pi dependencies.

When adding behavior or upgrading Pi, run [package checks](../README.md#validation), then load the bundle in an offline Pi session and check startup and `/reload` for duplicate registrations or leaks. Document new host assumptions here.
