# Testing

[Workspace development](../development.md)

## Coverage

1. Read the affected behavior and existing tests. Add a case only for a plausible defect the retained tests would miss.
2. Extend the relevant suite with representative cases for distinct failure modes. Keep assertions on public results so equivalent internal refactors preserve the tests.
3. For an automated regression test, establish **red** on the buggy behavior and **green** after the fix.

## Boundaries

Test contracts at their owning layer. Do not re-test unchanged Pi behavior or repeat shared-library algorithm suites in consumers. Consumer tests protect local policy and integration risks where adapters, wrappers, or monkey-patches can alter dependency behavior.

- **Pure behavior:** cover the changed contract's invariants, failure modes, and edge cases.
- **Extension TUI:** use static checks for thin rendering and layout adapters. Consider a manual check when interaction or appearance changes. Automated tests of rendering details are not required.
- **Reusable TUI:** test public selection, navigation, focus, sizing, and relevant edge cases under `packages/libs/src/tui/`. Keep component tests beside the component and host-mounting tests beside its adapter. Extensions that configure the shared browser do not need their own TUI tests. Assertions describe contracts, not rendered output wholesale.
- **Runtime behavior:** choose coverage for concrete risks in event handling, cancellation, cleanup, persistence, or error propagation. Prefer real boundaries or small injected fakes to elaborate mock setups.

## Runner

Keep `*.test.ts` next to the behavior it covers, with explicit imports from `vite-plus/test`. Use `vp test run` with missing-test failures visible.

For an intentionally test-free package, document the reason in its README and use `vp test run --passWithNoTests`. Remove that exception when meaningful tests are added.

Use the whole package suite when the change spans its behavior. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
