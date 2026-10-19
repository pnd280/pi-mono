# Native tool context fixture

[Offline validation](../../../README.md#offline-validation)

Import `createToolContext` from `@pi-mono/libs/validation/tool-context` when directly executing native tools in unit tests. Await `createToolContext(cwd)` to get Pi's complete `ExtensionToolContext` from a real `ExtensionRunner`, with an in-memory session, credentials, and model runtime. No network access or user configuration is required.

The fixture registers no tools and has no issuing assistant message. Nested execution therefore remains unavailable through Pi's own checks. It never fabricates a successful nested result. Tests of composition, exposure, or call provenance must instead execute a model-issued tool through an offline session, using the [interactive host](../interactive-host/README.md) when UI integration is needed.

Callers own filesystem fixtures and assertions. This helper creates no files and requires no terminal or disposal. Use the [library checks](../../../README.md#validation) and affected native-tool consumer suites after changing it.
