# Native tool context fixture

[Offline validation](../../../README.md#offline-validation)

Import `createToolContext` from `@pi-mono/libs/validation/tool-context` when directly executing native tools in unit tests. Await `createToolContext(cwd)` in a test or `beforeEach` to get Pi's complete `ExtensionToolContext` from a real `ExtensionRunner`, with an in-memory session, credentials, and model runtime. No network access or user configuration is required.

Until the test finishes, the process environment keeps only `PATH`, `SystemRoot`, and the terminal, locale, and temporary-directory variables. `HOME` and `PI_CODING_AGENT_DIR` point to a private temporary directory, so provider credentials and Pi configuration from the user's environment or home files cannot reach Pi's auth or model runtime. When the test finishes, the fixture restores every environment stub of the test, including the caller's, and removes the directory. To use other environment values, stub them after the call.

The fixture registers no tools and has no issuing assistant message. Nested execution therefore remains unavailable through Pi's own checks. It never fabricates a successful nested result. Tests of composition, exposure, or call provenance must instead execute a model-issued tool through an offline session, using the [interactive host](../interactive-host/README.md) when UI integration is needed.

Callers own filesystem fixtures and assertions. This helper requires no terminal or disposal. Use the [library checks](../../../README.md#validation) and affected native-tool consumer suites after changing it.
