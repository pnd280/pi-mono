# Small, high-value test suites

## Coverage bar

1. Read the affected behavior and existing tests. Add a case only for a plausible defect the retained tests would miss.
2. Extend the relevant suite with representative cases for distinct failure modes. Keep assertions on public results so equivalent internal refactors preserve the tests.
3. For an automated regression test, establish **red** on the buggy behavior and **green** after the fix.

## Boundaries

- **Pure behavior:** cover the changed contract's invariants, failure modes, and edge cases thoroughly.
- **Extension TUI:** use static checks for thin rendering/layout glue. Consider a manual check when interaction or appearance changes; automated tests of rendering details are not required.
- **Reusable TUI components:** test public selection, navigation, focus, sizing, and relevant edge cases in `packages/tui-components/`. Assertions should describe these contracts, not reproduce rendered output wholesale.
- **Runtime behavior:** choose coverage for concrete risks in event handling, cancellation, cleanup, persistence, or error propagation. Prefer real boundaries or small injected fakes to elaborate mock setups.

## Runner

Keep `*.test.ts` next to the behavior it covers, with explicit imports from `vite-plus/test`. Use `vp test run` with missing-test failures visible.

For an intentionally test-free package, document the reason in its README and use `vp test run --passWithNoTests`. Remove that exception when meaningful tests are added.

Use the whole package suite when the change spans its behavior. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
