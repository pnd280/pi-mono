---
name: audit-reusability
description: Find verified API substitutions and shared contracts that reduce maintenance.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Reusability audit

Audit only unless implementation is requested. Paths, staged changes, or a category narrow the scope; otherwise, review the workspace excluding dependencies and generated files.

## Workflow

### 1. Map scope and contracts

Inspect staged, unstaged, and untracked work to preserve unrelated changes. Inventory implementations, consumers, and tests, including utilities, libraries, extensions, UI, fixtures and providers, and handwritten API types. Establish documented contracts and import boundaries.

Read each applicable reference, including overlapping categories:

| Candidate                                                     | Reference                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Reuse or extraction across workspace consumers                | [Workspace code](references/workspace-code.md)                     |
| Local behaviour or types overlapping platform/dependency APIs | [Public APIs](references/public-apis.md)                           |
| Helpers, types, fixtures, providers, or TUI overlapping Pi    | [Pi APIs](references/pi-apis.md), in addition to public API checks |

Complete when: every in-scope area has its applicable categories and identified contracts; material exclusions are recorded.

### 2. Verify candidates

Read local implementations, alternatives, consumers, tests, and documentation. Search by behaviour as well as names, then inspect likely matches in context. Apply the category checks.

Resolve material uncertainty with focused offline probes using disposable state and no inherited real credentials.

Complete when: every candidate has a consumer map, contract comparison, replacement or extraction location, and evidence, or an explicit missing-evidence entry.

### 3. Classify findings

| Classification       | Criterion                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Direct substitution  | A verified API preserves contracts and removes duplication without compensating complexity.                          |
| Shared extraction    | Actual consumers need a common contract unavailable elsewhere; extraction preserves policy and ownership boundaries. |
| Conditional refactor | Adoption requires behaviour, policy, integration, or dependency changes; name the required decision.                 |
| Keep local           | Code already composes shared APIs, adds required behaviour, or lacks a useful replacement or common contract.        |
| Unresolved           | Evidence is insufficient to confirm the candidate.                                                                   |

Record one finding per cause with title, priority, category, classification, local/replacement `path:line` locations, symbols and imports, consumers, behavioural differences, maintenance benefit, and required decisions. For extraction, include sources, proposed contract, and destination. Separate performed checks from proposed checks and state confidence and uncertainty.

Complete when: all candidates have evidence-backed classifications. For audit-only work, proceed to reporting.

### 4. Apply requested changes

Implement the authorised direct substitutions and shared extractions. Leave conditional refactors as decisions.

Complete when: every authorised change and affected consumer is updated and required checks pass. Report blocked changes as incomplete.

### 5. Report

Report prioritised findings or changes, scope and exclusions, important keep-local decisions, and remaining uncertainty. Unreviewed areas and unverified contracts remain visible rather than implied complete.
