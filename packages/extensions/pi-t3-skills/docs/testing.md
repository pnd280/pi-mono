# T3 skill-chip test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests format trust, activation, and the removal of T3 Code's skill blocks with a verbatim copy of T3 Code's hook. [@pi-mono/utils](../../../utils/docs/testing.md) owns the shared skill-reference expansion, and Pi owns skill discovery and settings trust.

## Must not regress

- **Critical, e2e:** A project format for `ext.pi-t3-skills` overrides the global format only when it is valid and comes from the trusted current directory, not an ancestor.
- **High, e2e:** With T3 Code's hook loaded before or after this extension, also with pi-skills loaded after T3 Code's hook, a `$<name>` chip reaches the provider as the formatted reference, and neither the provider request nor the saved session contains a `<skill` block.
- **High, e2e:** Without `T3_PI_MCP_EXTENSION_PATH`, a `$<name>` chip reaches the provider unchanged.
- **High, unit:** Suffix removal changes only an exact T3 Code suffix; user text that resembles a skill block stays.

## Not tested

- @pi-mono/utils owns existing-reference detection and the leading-reference guard.
- Format reloads on `/reload` and chip matching cases outside the invariants above are below the severity bar.
