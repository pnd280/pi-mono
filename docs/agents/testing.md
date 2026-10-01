# Testing

[Workspace development](../development.md)

## Coverage

1. If the affected package has `docs/testing.md`, read it for observable contracts, failure modes, ownership, and exclusions. Verify claims against public APIs, consumers, documentation, and regression evidence. Update it when contracts, risks, or boundaries change.
2. Read the affected behaviour and existing tests. Add cases for meaningful behaviour or plausible defects retained tests would miss. Assert public results that tolerate equivalent internal refactors.
3. Establish a failing test (red) before a regression fix and a passing test (green) after it, using existing tests that expose the failure. Preserve distinct regression scenarios during cleanup. A passing reduced suite does not prove removed coverage was redundant.

## Test quality

- Tautological tests cannot reveal incorrect behaviour. Use independently specified results or invariants, rather than expectations derived from the result or a duplicate of the implementation's algorithm.
- Change-detector tests fail during equivalent internal refactors. Assert observable contracts rather than those implementation details.
- Add or extend regression tests only for genuine behaviour coverage gaps. A bug fix alone does not warrant a new test; use existing tests that expose the failure for red/green verification rather than adding duplicates.

## Boundaries

Test contracts at their owning layer. Consumers cover local policy and integration risks from adapters, wrappers, or monkey-patches, not unchanged Pi behaviour or shared-library algorithms.

### Ownership

| Layer                                                                     | Tests                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Utils](../../packages/utils/docs/testing.md)                             | Pure validation and parsing: paths, patches, selections, search scopes, and FFF provenance.                                          |
| [Libs](../../packages/libs/docs/testing.md)                               | Reusable protocols with I/O or scheduling: search ranking, files, locks, Git, caches, cancellation, terminal safety, and shared TUI. |
| Extensions                                                                | Feature policy: schemas, budgets, messages, activation, and the wiring of shared helpers.                                            |
| [Tool display](../../packages/extensions/pi-tool-display/docs/testing.md) | Rendering of other extensions' tool cards through its adapters.                                                                      |

A consumer keeps an integration check where it could omit a safety option or misread a shared result. It does not repeat the shared failure matrix. Each package's `docs/testing.md` names only what that package tests.

| Changed behaviour | Coverage                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure behaviour    | Cover the contract's invariants, failure modes, and edge cases.                                                                                                                                                                                            |
| Extension TUI     | Statically check thin rendering and layout adapters; consider manual checks for interaction or appearance changes. Rendering-detail tests are optional.                                                                                                    |
| Reusable TUI      | Test public selection, navigation, focus, sizing, and edge cases under `packages/libs/src/tui/`, beside the component or host adapter. Extensions configuring the shared browser need no separate TUI tests. Assert contracts, not entire rendered output. |
| Runtime behaviour | Cover concrete event, cancellation, cleanup, persistence, and error-propagation risks. Prefer real boundaries or small injected fakes over elaborate mocks.                                                                                                |

## Filesystem fixtures

Create mutable filesystem fixtures with `mkdtemp` or `mkdtempSync` under `tmpdir()` from `node:os`, not workspace `.tmp/`. Remove them during teardown. Workspace fixtures can become Vite+ cache inputs and cause misses.

## Runner

Colocate `*.test.ts` with its behaviour and import explicitly from `vite-plus/test`. Use `vp test run` with missing-test failures visible.

For intentionally test-free packages, explain why near the package's validation instructions and use `vp test run --passWithNoTests`. Report "no tests ran" and remove the exception when tests are added.

Use the whole package suite when the change spans its behaviour. For a single file, pass its path to the [package script](../development.md#focused-validation):

```sh
vpr '<package-name>#test' src/behavior.test.ts
```
