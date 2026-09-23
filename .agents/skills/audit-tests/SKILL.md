---
name: audit-tests
description: Audit test suites for meaningful regression coverage and proportionate maintenance cost.
disable-model-invocation: true
---

# Test audit

Evaluate the regression value of tests against their ownership and maintenance cost. Optimize for distinct failure modes, not a target test count.

Accept paths, staged changes, or a category. Without scope, review workspace tests, excluding dependencies and generated files. An audit produces findings; apply changes only when cleanup is requested.

## Establish scope

1. Inspect staged/unstaged changes and preserve unrelated work. Read applicable package instructions and [workspace testing guidance](../../../docs/agents/testing.md).
2. Inventory suites and fixtures alongside the production behavior they exercise. Distinguish runner-discovered cases, parameterized rows, and distinct contracts; counts alone establish none of their value.
3. Consult each affected package's `docs/testing.md` through its README's Validation section. Verify it using the shared guide's [coverage requirements](../../../docs/agents/testing.md#coverage). Establish missing specifications before cleanup; exclusions need evidence independent of the proposed deletions.
4. Identify shared-library and dependency-owned behavior, including consumer wiring that still needs protection. Record material exclusions and installed dependency versions where ownership depends on them.

## Load relevant categories

Read references when their review conditions apply. Add future categories as separate references.

| Category                                   | Review                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| [Over-testing](references/over-testing.md) | Redundant cases, dependency-owned behavior, and integration scaffolding disproportionate to its regression value. |

## Verify and report

For each candidate, read its assertions, fixture, implementation, and relevant retained tests. Name the plausible defect it catches and whether another test would catch the same defect. Use focused offline probes only for material uncertainty.

Classify findings:

- **Keep:** protects a distinct local contract or integration risk.
- **Simplify:** useful coverage with redundant cases, assertions, or fixture machinery.
- **Remove:** duplicates retained coverage or checks unchanged behavior owned elsewhere.
- **Unresolved:** ownership or unique regression value remains uncertain.

For audit-only findings, provide `path:line`, classification, owning contract, proposed change, and retained coverage or deliberate exclusion. During cleanup, summarize decisions by package rather than by assertion. Distinguish observed results from source-based conclusions; identify an owning API without assuming its upstream tests exist.

Finish with priorities, important keep cases, scope limits, actual checks, and unresolved risks. Group by cause rather than filling a findings quota.

## Apply requested cleanup

1. Record baseline failures and discovery/execution counts. Map each removal to retained coverage or an evidenced exclusion. For workspace cleanup, establish all package specifications first, then pilot one package and continue in package-sized batches.
2. Keep useful tests; replace brittle coverage with public outcomes or small boundary fakes. Remove redundant scenarios and unused fixture branches, mocks, observers, and helpers. Keep production behavior unchanged; investigate bugs or ambiguous contracts separately.
3. Verify reductions using the [evidence techniques](references/over-testing.md#evidence-for-removal), then run affected suites and [required verification](../../../docs/agents/verification.md). Include consumers when ownership or shared infrastructure changes, and check the diff for accidental coverage loss.
4. After the pilot and each substantial batch, use findings to revise superseded guidance: audit methods in references, package contracts in `docs/testing.md`, and repository policy in the shared guide. Check changed Markdown and links.
5. Report comparable before/after counts, including skips and packages with no tests. Distinguish removed scenarios from relocated or strengthened coverage; name protected behaviors, deleted scaffolding, actual checks, baseline failures, and unfinished work. Claim runtime improvements only when measured.
