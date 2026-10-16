# Bounded patch deadline fixture

[Offline validation](../../../README.md#offline-validation)

Call `useStepPatchDeadline()` from `@pi-mono/libs/validation/bounded-diff` inside a Vite+ test that expects a `ready` patch from code with its own [bounded-diff](../../bounded-diff/README.md) time budget.

## Behaviour

Until the current test finishes, every `createBoundedPatch` call in the test process uses `STEP_TIMEOUT_MS` instead of the caller's `timeoutMs`. The real worker still compares the sources, and the other limits still apply.

Callers such as display observation use a 50 ms budget. That budget is wall-clock time, and a full suite run can exceed it, so the result becomes `budget-exceeded`. The spy records the caller's original options, so tests can still assert the budget that the caller supplied.

## Caller responsibilities

- Use the fixture only in tests whose assertion needs a generated patch, not in tests of the deadline itself.
- Run the code under test in the test process. Spawned Pi processes keep their callers' budgets.
