# Testing

[Workspace development](../development.md)

## Coverage

1. Read affected behavior and existing tests. Add cases only for plausible defects retained tests would miss.
2. Cover distinct failure modes in the relevant suite. Assert public results, allowing equivalent internal refactors.
3. Establish **red** before a regression fix and **green** after it.

## Boundaries

Test contracts at their owning layer. Consumers cover local policy and integration risks from adapters, wrappers, or monkey-patches, not unchanged Pi behavior or shared-library algorithms.

- **Pure behavior:** cover the changed contract's invariants, failure modes, and edge cases.
- **Extension TUI:** statically check thin rendering and layout adapters; consider manual checks for interaction or appearance changes. Rendering-detail tests are optional.
- **Reusable TUI:** test public selection, navigation, focus, sizing, and edge cases under `packages/libs/src/tui/`, beside the component or host adapter. Extensions configuring the shared browser need no separate TUI tests. Assert contracts, not entire rendered output.
- **Runtime behavior:** cover concrete event, cancellation, cleanup, persistence, and error-propagation risks. Prefer real boundaries or small injected fakes over elaborate mocks.

## Filesystem fixtures

Create mutable filesystem fixtures with `mkdtemp` or `mkdtempSync` under `tmpdir()` from `node:os`, not workspace `.tmp/`. Remove each fixture directory during teardown. Generated fixtures inside the workspace can become Vite+ cache inputs and cause misses.

## Runner

Colocate `*.test.ts` with its behavior and import explicitly from `vite-plus/test`. Use `vp test run` with missing-test failures visible.

For intentionally test-free packages, explain why in the README and use `vp test run --passWithNoTests`. Remove the exception when tests are added.

Use the whole package suite when the change spans its behavior. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
