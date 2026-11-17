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

Read the invariant list that owns each in-scope suite, as the [coverage policy](../../../../docs/agents/testing.md#coverage) assigns it. Map every test case and parameterised row to the listed invariants it protects, or to none. Follow the policy's [budget](../../../../docs/agents/testing.md#budget) for e2e scenarios that protect several invariants.

Complete when: every case maps to an invariant or to none.

## 2. Classify

| Classification | Criterion                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep           | Protects a listed invariant at its layer, and catches a defect that no retained case catches.                                                            |
| Remove         | Maps to no invariant and does not meet the Unresolved criterion, or repeats a defect that a retained case catches. For a repeat, name the retained case. |
| Replace        | Several cases that one e2e scenario can cover. That scenario must reach the same failure state.                                                          |
| Unresolved     | Protects behaviour that seems high or critical but is not listed. Propose the invariant to the user.                                                     |

Also flag invariants that are below the severity bar, that describe removed behaviour, or that no case covers. If evidence is uncertain, inject the defect temporarily in a disposable copy and confirm that a retained case fails. Leave the user's working tree unchanged.

Complete when: every case and invariant has a classification with `path:line` and evidence. For an audit-only request, go to step 4.

## 3. Clean up

1. Get user approval for new invariants, and for dropped invariants whose behaviour still exists. When the behaviour itself is removed, remove its invariant and tests as the [coverage policy](../../../../docs/agents/testing.md#coverage) requires. Record baseline counts and failures.
2. Per package: write replacement scenarios first, then remove cases and the scaffolding that only they used. Do not change production code.
3. Run affected suites, including consumers of shared code. Update the owning invariant list to match the retained invariants.

Complete when: every case maps to a listed invariant, affected suites pass, and the owning invariant list matches.

## 4. Report

Follow [verification](../../../../docs/agents/verification.md). For each package, report proposed and dropped invariants, removals, replacements, unresolved cases, and before-and-after case counts.
