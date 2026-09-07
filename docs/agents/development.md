# Development instructions

Follow the shared [development conventions](../development.md) for package structure, documentation, tooling, pi APIs, and local loading.

## Validation

Use the shared [focused validation commands](../development.md#focused-validation). Follow the [testing convention](testing.md) for the test runner, coverage decisions, and handoff. For shared-code changes, use the [consumer verification rule](architecture.md#reuse-decision) to select affected consumers as well.

## Package instructions

Every workspace package must have an `AGENTS.md` covering package-specific constraints, code navigation, and development or validation instructions. Link to the package README and shared conventions instead of duplicating them.

Update the package's `AGENTS.md` in the same change whenever its instructions are affected by public behavior, API, configuration, usage, or development workflow changes.
