---
name: audit-tests
description: Audit tests against listed high and critical invariants; prune only when requested.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Test audit

Enforce the [testing policy](../../../../docs/agents/testing.md#coverage) for listed invariants, layers, and budget. Audit only, unless the user requests cleanup. Scope to supplied paths or packages; otherwise, audit all workspace tests. Keep unrelated staged and unstaged work.

## 1. Map

Read each in-scope package's `docs/testing.md`. Map every test case and parameterised row to the listed invariants it protects, or to none. Follow the policy's [budget](../../../../docs/agents/testing.md#budget) for e2e scenarios that protect several invariants.

**Complete when:** every case maps to an invariant or to none.

## 2. Classify

- **Keep:** protects a listed invariant at its layer, and catches a defect that no retained case catches.
- **Remove:** maps to no invariant and does not meet the Unresolved criterion, or repeats a defect that a retained case catches. For a repeat, name the retained case.
- **Replace:** several cases that one e2e scenario can cover. That scenario must reach the same failure state.
- **Unresolved:** protects behaviour that seems high or critical but is not listed. Propose the invariant to the user.

Also flag invariants that are below the severity bar, that describe removed behaviour, or that no case covers. If evidence is uncertain, inject the defect temporarily in a disposable copy and confirm that a retained case fails. Leave the user's working tree unchanged.

**Complete when:** every case and invariant has a classification with `path:line` and evidence. For an audit-only request, go to step 4.

## 3. Clean up

1. Get user approval for new and dropped invariants. Record baseline counts and failures.
2. Per package: write replacement scenarios first, then remove cases and the scaffolding that only they used. Do not change production code.
3. Run affected suites, including consumers of shared code. Update `docs/testing.md` to match the retained invariants.

**Complete when:** every case maps to a listed invariant, affected suites pass, and `docs/testing.md` matches.

## 4. Report

Follow [verification](../../../../docs/agents/verification.md). For each package, report proposed and dropped invariants, removals, replacements, unresolved cases, before-and-after case counts, and the checks you ran with their results.
