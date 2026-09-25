---
name: audit-tests
description: Audit test coverage and maintenance cost; clean up only when requested.
disable-model-invocation: true
---

# Test audit

Evaluate distinct failure modes, ownership, and maintenance cost. Default to audit-only; edit tests only when cleanup is requested. Use the supplied paths, changes, or category as scope; otherwise, review workspace tests excluding dependencies and generated files.

## Workflow

### 1. Map suites to contracts

Inspect staged, unstaged, and untracked work to preserve unrelated changes. Read applicable package instructions and the [workspace testing guide](../../../docs/agents/testing.md). Consult each affected package's `docs/testing.md` through its README's Validation section; verify its claims against public APIs, consumers, documentation, and regression evidence.

Map suites and fixtures to observable contracts and their local, shared-library, or dependency owners. Include consumer wiring risks and dependency versions where ownership depends on them. Distinguish runner-discovered cases, parameterized rows, and distinct contracts.

**Complete when:** every in-scope suite has an owning contract, with specification gaps and material exclusions recorded.

### 2. Classify candidates

For each candidate, inspect assertions, fixtures, implementation, and retained tests. Apply the [over-testing checks](#over-testing) and [evidence for removal](#evidence-for-removal). Name the plausible defect caught and whether retained coverage catches the same defect.

- **Keep:** protects a distinct local contract or integration risk.
- **Simplify:** useful coverage has redundant cases, assertions, or scaffolding.
- **Remove:** duplicates retained coverage or checks unchanged behavior owned elsewhere.
- **Unresolved:** ownership or unique regression value remains uncertain.

Record `path:line`, classification, owning contract, proposed change, and supporting evidence for each actionable finding.

**Complete when:** every candidate has an evidenced classification; uncertain removals remain unresolved. For audit-only work, continue at step 4.

### 3. Apply requested cleanup

Before editing, establish missing specifications for every affected package and justify exclusions independently of proposed deletions.

1. Record baseline failures and discovery/execution counts. For workspace cleanup, pilot one package, then continue in package-sized batches.
2. Preserve public outcomes with real boundaries or small fakes. Remove redundant scenarios and their unused fixtures, mocks, observers, and helpers. Keep production behavior unchanged; investigate bugs and ambiguous contracts separately.
3. Run affected suites, including consumers when ownership or shared infrastructure changes. Review the diff for coverage loss.
4. After the pilot and each substantial batch, update superseded guidance: audit methods here, package contracts in `docs/testing.md`, repository policy in the shared guide. New policy decisions require separate scope.

**Complete when:** every reduction meets the evidence requirements, obsolete scaffolding is removed, affected checks pass, and guidance matches retained coverage. Blocked cleanup remains incomplete.

### 4. Verify and report

Follow [required verification](../../../docs/agents/verification.md) for changed files. Group audit findings by cause and cleanup decisions by package.

- Report priorities, important keep decisions, scope limits, exact checks/results, baseline failures, and unresolved risks. Distinguish observed results from source-based conclusions.
- For cleanup, include comparable before/after counts, skips, packages with no tests, protected behaviors, and deleted scaffolding. Separate removed scenarios from relocated or strengthened coverage; claim runtime improvements only when measured.

**Complete when:** the report accounts for the full scope and identifies unfinished work.

## Over-testing

### Test quality

Apply the shared [test-quality principles](../../../docs/agents/testing.md#test-quality) to candidate assertions:

- **Tautological tests:** replace self-derived expectations or copied implementation algorithms with independently specified results or invariants before counting them as protection.
- **Change-detector tests:** replace assertions that merely detect internal changes with observable contract checks that survive equivalent refactors.
- **Bug-fix regressions:** add or extend tests only for a genuine behavior-coverage gap. Use existing tests for red/green when they expose the failure; bug-fix provenance alone establishes no unique regression value.

Assert meaningful boundary outcomes: byte-limit checks need useful-content assertions, and provider checks can verify the model and source received rather than internal calls.

### Ownership

Trace each assertion to its owning layer:

- **Local behavior:** retain parsing, validation, policy, identity, mutation, and error cases at their owning unit.
- **Composition:** retain focused integration checks for registration, lifecycle, event interception, and host routing that unit tests cannot establish.
- **Delegation:** consider removing checks of unchanged dependency behavior while preserving local adapter, wrapper, and monkey-patch risks. Identifying an owning API establishes ownership, not the existence of upstream tests.

Use one authoritative suite per pure contract, plus focused integration checks for wiring, configured budgets, and consumer policy. Before removing consumer regressions, verify that the owner suite covers their exact distinction; move missing cases there with a minimal boundary fixture.

Similar assertions across layers may catch different defects. Retain differential tests against dependency contracts and consumer integration checks for cross-process lost updates or post-commit error mapping.

### Redundancy

For each reduction, identify the discarded distinction and why it adds no unique local protection. Compare inputs and assertions, not test names or counts.

- Compare mode, position, source, delivery, and option matrices against distinct branches and plausible boundary failures. SDK mode labels do not exercise CLI process output or exit behavior.
- Retain cheap table-driven cases for matching, whitespace, trust, validation, and formatting distinctions. Inheritance and rejection can warrant separate cases even when both use invalid settings.
- Judge scaffolding cost separately from row counts and test-to-code ratios. Reduce scenarios and setup, preserving independent failure reporting; renamed tests or assertion loops alone reduce neither coverage cost nor redundancy.

### Evidence for removal

Record the removed scenario, owning implementation/API, retained tests for local risks or an evidenced exclusion, and fixture code made unnecessary. A passing reduced suite alone does not prove redundancy; missing evidence for a plausible local failure leaves the candidate unresolved.

- **Lifecycle sequences:** retain meaningful transitions, not just final values. Empty then valid input can prove an automatic attempt remains available; a value changed and restored can still require event-driven cancellation.
- **Stress mechanisms:** smaller near-limit fixtures must reach the same limit and failure state. Retain enough load to trigger stack overflow, worker-memory limits, or cooperative yielding.
- **Counterexamples:** resolve material uncertainty with focused offline probes or temporary fault injection. Verify that retained coverage detects the suspected defect, restore production code, and rerun checks.
