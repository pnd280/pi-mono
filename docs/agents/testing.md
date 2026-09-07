# Small, high-value test suites

## Coverage bar

Every added case must catch a plausible defect that the retained tests would miss. Use behavior gaps to justify tests, never test counts or blanket coverage targets.

1. Read the affected behavior and existing tests. Identify the uncovered contract or failure before writing a case; existing coverage can be sufficient.
2. Choose the boundary below. Extend the relevant suite with representative cases for distinct failure modes. Keep assertions on public results so equivalent internal refactors preserve the tests.
3. For an automated regression test, establish **red** on the buggy behavior and **green** after the fix. A passing test alone does not establish regression coverage.

## Boundaries

- **Pure behavior:** cover the changed contract's invariants, failure modes, and edge cases thoroughly. One representative per distinct case is preferable to enumerating equivalent inputs.
- **Extension TUI:** use static checks for thin rendering/layout glue. Consider a manual check when interaction or appearance changes; automated tests of rendering details are not required.
- **Reusable TUI components:** test public selection, navigation, focus, sizing, and relevant edge cases in `packages/tui-components/`. Assertions should describe these contracts, not reproduce rendered output wholesale.
- **Runtime behavior:** choose coverage for concrete risks in event handling, cancellation, cleanup, persistence, or error propagation. Prefer real boundaries or small injected fakes to elaborate mock setups.
- **Reversible configuration/documentation:** validate with the relevant tools.

For a manual check, follow [local loading](../development.md#local-loading) and exercise the affected feature.

## Runner and handoff

Keep `*.test.ts` next to the behavior it covers, with explicit imports from `vitest`. Every package exposes `test`, normally `"test": "vitest run"`, with missing-test failures visible.

For an intentionally test-free package, document the reason in its README and use `vitest run --passWithNoTests` to report an empty run explicitly. Remove that exception when meaningful tests are added.

Run the relevant test file or suite through its package script using the exact manifest name. Use the whole package suite when the change spans its behavior:

```sh
pnpm --filter '<package-name>' test src/behavior.test.ts
```

Review added cases against the coverage bar; remove redundant or implementation-coupled additions. In the handoff, name the protected behaviors and report unverified regression claims. If the run executed no tests, report **no tests ran**, whether packages were absent or explicitly test-free.
