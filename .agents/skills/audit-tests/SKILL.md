---
name: audit-tests
description: Audit test suites for meaningful regression coverage and proportionate maintenance cost.
disable-model-invocation: true
---

# Test audit

Evaluate tests by distinct failure modes, ownership, and maintenance cost, not a target count. Audit only unless cleanup is requested. Paths, staged changes, or a category narrow the scope; otherwise, review workspace tests excluding dependencies and generated files.

## Workflow

### 1. Map suites to contracts

Inspect staged, unstaged, and untracked work to preserve unrelated changes. Read applicable package instructions and [workspace testing guidance](../../../docs/agents/testing.md). Inventory suites, fixtures, and the production behavior they exercise. Distinguish runner-discovered cases, parameterized rows, and distinct contracts.

Consult each affected package's `docs/testing.md` through its README's Validation section. Verify its claims using the shared guide's [coverage requirements](../../../docs/agents/testing.md#coverage). Identify local, shared-library, and dependency-owned behavior, including consumer wiring that still needs protection. Record dependency versions where ownership depends on them.

**Complete when:** every in-scope suite maps to an owning contract, and material exclusions and specification gaps are recorded. Before cleanup, establish missing specifications for every affected package; justify exclusions independently of proposed deletions.

### 2. Verify and classify candidates

Read [over-testing checks](references/over-testing.md) for redundant cases, dependency-owned behavior, and disproportionate integration scaffolding. For each candidate, inspect assertions, fixtures, implementation, and relevant retained tests. Name the plausible defect it catches and whether another test catches the same defect. Use focused offline probes only for material uncertainty.

- **Keep:** protects a distinct local contract or integration risk.
- **Simplify:** useful coverage has redundant cases, assertions, or fixture machinery.
- **Remove:** duplicates retained coverage or checks unchanged behavior owned elsewhere.
- **Unresolved:** ownership or unique regression value remains uncertain.

For each actionable finding, record `path:line`, classification, owning contract, proposed change, and retained coverage or evidenced exclusion. Distinguish observed results from source-based conclusions; identifying an owning API does not establish that upstream tests exist. Group findings by cause.

**Complete when:** every candidate has a classification and supporting evidence, with uncertain removals left unresolved. For audit-only work, proceed to reporting.

### 3. Apply requested cleanup

1. Record baseline failures and discovery/execution counts. Map each removal to retained coverage or an evidenced exclusion. For workspace cleanup, pilot one package after all package specifications are established, then continue in package-sized batches.
2. Preserve useful coverage through public outcomes or small boundary fakes. Remove redundant scenarios and unused fixture branches, mocks, observers, and helpers. Keep production behavior unchanged; investigate bugs or ambiguous contracts separately.
3. Verify each reduction using [evidence for removal](references/over-testing.md#evidence-for-removal). Run affected suites and include consumers when ownership or shared infrastructure changes. Review the diff for accidental coverage loss.
4. After the pilot and each substantial batch, correct superseded guidance where it belongs: audit methods in references, package contracts in `docs/testing.md`, repository policy in the shared guide. Keep new policy decisions outside cleanup scope.

**Complete when:** every applied reduction has retained protection or an evidenced exclusion, obsolete scaffolding is removed, affected checks pass, and guidance matches the resulting coverage. Blocked cleanup remains incomplete.

### 4. Verify and report

Follow [required verification](../../../docs/agents/verification.md), including changed Markdown and links. Report priorities, important keep decisions, scope limits, exact checks/results, baseline failures, and unresolved risks.

For cleanup, summarize decisions by package rather than assertion. Include comparable before/after counts, skips, and packages with no tests; distinguish removed scenarios from relocated or strengthened coverage. Name protected behaviors, deleted scaffolding, and unfinished work. Claim runtime improvements only when measured.

**Complete when:** findings or cleanup results account for the full scope, and the report separates verified results from inference and unfinished work.
