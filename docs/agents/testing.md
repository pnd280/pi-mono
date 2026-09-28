# Testing

[Workspace development](../development.md)

## Coverage

1. Read the affected package's `docs/testing.md`, linked from its README's Validation section. It specifies observable contracts, failure modes, ownership, and exclusions, not test files. Verify claims against public APIs, consumers, documentation, and regression evidence. Update it when contracts, risks, or boundaries change.
2. Read affected behavior and existing tests. Add cases for meaningful behavior or plausible defects retained tests would miss. Assert public results that tolerate equivalent internal refactors.
3. Establish **red** before a regression fix and **green** after it, using existing tests that expose the failure. Preserve distinct regression scenarios during cleanup. A passing reduced suite does not prove removed coverage was redundant.

## Test quality

- **Tautological tests are harmful.** Use independently specified results or invariants that can reveal incorrect behavior, not expectations derived from the result or a duplicate of the implementation's algorithm.
- **Change-detector tests are harmful.** Assert observable contracts, not implementation details that change during equivalent internal refactors.
- **Bug fixes do not automatically warrant new regression tests.** Add or extend tests only for genuine behavior coverage gaps. Use existing tests that expose the failure for red/green verification rather than adding duplicates.

## Boundaries

Test contracts at their owning layer. Consumers cover local policy and integration risks from adapters, wrappers, or monkey-patches, not unchanged Pi behavior or shared-library algorithms.

- **Pure behavior:** cover the changed contract's invariants, failure modes, and edge cases.
- **Extension TUI:** statically check thin rendering and layout adapters; consider manual checks for interaction or appearance changes. Rendering-detail tests are optional.
- **Reusable TUI:** test public selection, navigation, focus, sizing, and edge cases under `packages/libs/src/tui/`, beside the component or host adapter. Extensions configuring the shared browser need no separate TUI tests. Assert contracts, not entire rendered output.
- **Runtime behavior:** cover concrete event, cancellation, cleanup, persistence, and error-propagation risks. Prefer real boundaries or small injected fakes over elaborate mocks.

## Filesystem fixtures

Create mutable filesystem fixtures with `mkdtemp` or `mkdtempSync` under `tmpdir()` from `node:os`, not workspace `.tmp/`. Remove them during teardown. Workspace fixtures can become Vite+ cache inputs and cause misses.

## Runner

Colocate `*.test.ts` with its behavior and import explicitly from `vite-plus/test`. Use `vp test run` with missing-test failures visible.

For intentionally test-free packages, explain why in `docs/testing.md`, link it from the README, and use `vp test run --passWithNoTests`. Report **no tests ran** and remove the exception when tests are added.

Use the whole package suite when the change spans its behavior. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
