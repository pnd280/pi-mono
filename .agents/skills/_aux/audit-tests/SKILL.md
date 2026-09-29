---
name: audit-tests
description: Audit test coverage and maintenance cost; clean up only when requested.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Test audit

Evaluate distinct failure modes, ownership, and maintenance cost. Audit only unless cleanup is requested. Scope to supplied paths, changes, or category; otherwise, review workspace tests excluding dependencies and generated files.

## Workflow

### 1. Map suites to contracts

Inspect staged, unstaged, and untracked work to preserve unrelated changes. Read applicable package instructions and the [workspace testing guide](../../../../docs/agents/testing.md), including its [test-quality principles](../../../../docs/agents/testing.md#test-quality) for every audit branch. If an affected package has `docs/testing.md`, verify its claims against public APIs, consumers, and regression evidence.

Map suites and fixtures to observable contracts and their local, shared-library, or dependency owners. Include consumer wiring risks and dependency versions where ownership depends on them. Distinguish runner-discovered cases, parameterized rows, and distinct contracts.

**Complete when:** every in-scope suite has an owning contract, with specification gaps and material exclusions recorded.

### 2. Classify candidates

For each candidate, inspect assertions, fixtures, implementation, and retained tests. When considering simplification or removal, apply the [over-testing and removal checks](references/over-testing.md); for other candidates, use its ownership checks where the contract owner is unclear. Name the plausible defect caught and whether retained coverage catches the same defect.

- **Keep:** protects a distinct local contract or integration risk.
- **Simplify:** useful coverage has redundant cases, assertions, or scaffolding.
- **Remove:** duplicates retained coverage or checks unchanged behavior owned elsewhere.
- **Unresolved:** ownership or unique regression value remains uncertain.

Record `path:line`, classification, owning contract, proposed change, and supporting evidence for each actionable finding.

**Complete when:** every candidate has an evidenced classification; uncertain removals remain unresolved. For audit-only work, continue at step 4.

### 3. Apply requested cleanup

Before editing, resolve contract gaps in the owning tests or focused guidance and justify exclusions independently of proposed deletions.

1. Record baseline failures and discovery/execution counts. For workspace cleanup, pilot one package, then continue in package-sized batches.
2. Preserve public outcomes with real boundaries or small fakes. Remove redundant scenarios and their unused fixtures, mocks, observers, and helpers. Keep production behavior unchanged; investigate bugs and ambiguous contracts separately.
3. Run affected suites, including consumers when ownership or shared infrastructure changes. Review the diff for coverage loss.
4. After the pilot and each substantial batch, update superseded guidance: audit methods here, package contracts in `docs/testing.md`, repository policy in the shared guide. New policy decisions require separate scope.

**Complete when:** every reduction meets the evidence requirements, obsolete scaffolding is removed, affected checks pass, and guidance matches retained coverage. Blocked cleanup remains incomplete.

### 4. Verify and report

Follow [required verification](../../../../docs/agents/verification.md) for changed files. Group audit findings by cause and cleanup decisions by package.

- Report priorities, important keep decisions, scope limits, exact checks/results, baseline failures, and unresolved risks. Distinguish observed results from source-based conclusions.
- For cleanup, include comparable before/after counts, skips, packages with no tests, protected behaviors, and deleted scaffolding. Separate removed scenarios from relocated or strengthened coverage; claim runtime improvements only when measured.

**Complete when:** the report accounts for the full scope and identifies unfinished work.
