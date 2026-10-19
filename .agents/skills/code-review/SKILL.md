---
name: code-review
description: Audit and revise targeted code or recent changes through sequential UI consistency, reusability, TypeScript, coding style, test, and documentation audits.
---

# Code review

Audit and revise code using all six skills below, in order. Invocation authorises evidence-backed, in-scope changes, including test cleanup. Explicit audit-only instructions take precedence.

## Scope

- Use supplied paths, symbols, features, or a Git range as the target.
- Otherwise, use the initial staged, unstaged, and non-ignored untracked changes. If none exist, use the latest commit's changes.
- Record and freeze this initial scope before editing. For change-based targets, focus on changed behaviour and its enclosing implementation, not every unrelated issue in touched files.
- Inspect related implementations, consumers, tests, and documentation as needed. Edit outside the initial scope only when necessary to complete an in-scope change correctly.
- Preserve unrelated work. Do not commit, stage, reset, or discard changes.

## Preparation

Read applicable repository instructions and [workspace development guidance](../../../docs/development.md). When the scope uses Pi APIs, also read the [Pi API contracts](../../../docs/agents/pi-apis.md). Record the initial Git state, scope, and relevant baseline diagnostics. Create a phase checklist.

## Phases

Execute these phases sequentially. Resolve relative skill links from this file. The scope and implementation authorisation above take precedence over child skills' default scope, review-only mode, and confirmation steps. Repository-required approvals still apply, including approval for new invariants under the [testing policy](../../../docs/agents/testing.md#coverage).

1. [UI consistency](../_aux/audit-ui-consistency/SKILL.md)
   Audit and apply justified UI consistency fixes. Establish intended user-facing contracts and preserve intentional differences. If no UI surfaces are relevant, record why this phase is not applicable.

2. [Reusability](../_aux/audit-reusability/SKILL.md)
   Audit and apply verified substitutions and justified shared extractions. Preserve consumer policy and ownership; do not introduce abstractions merely because code looks similar.

3. [TypeScript review](../_aux/typescript-review/SKILL.md)
   Review runtime correctness and type contracts together, using the main skill and both companions that the skill names. Reconcile findings by root cause and apply evidence-backed fixes. If no TypeScript is relevant, record why this phase is not applicable.

4. [Coding style](../_aux/audit-coding-style/SKILL.md)
   Audit and normalise the resulting implementation using established conventions. Preserve behaviour and avoid cosmetic churn without maintenance benefit.

5. [Tests](../_aux/audit-tests/SKILL.md)
   Audit and apply test cleanup against the resulting production structure. Preserve distinct regression protection and require evidence for removals. Address meaningful coverage gaps introduced or exposed by this work.

6. [Documentation](../_aux/audit-docs-v2/SKILL.md)
   Audit documentation affected by the scoped behaviour and resulting changes. Correct verified inaccuracies and missing guidance, and improve relevance, structure, and wording while preserving essential contracts. If no documentation is relevant, record why this phase is not applicable.

For each phase:

- Read the skill and applicable references; follow its workflow within the frozen scope.
- Audit, classify findings, apply authorised changes, and verify them before advancing.
- Update affected consumers and documentation together.
- Run relevant checks throughout; do not defer testing until the Tests phase.
- Fix regressions caused by your changes. Keep baseline failures and unresolved findings explicit.
- Do not force edits when the evidence supports keeping the code.
- Ask only when a material ambiguity, contract change, architectural redesign, or scope expansion requires a decision. Continue independent authorised work.

## Finish

Review the cumulative diff and complete [required repository verification](../../../docs/agents/verification.md). Report the scope, important changes and keep decisions, exact checks and results, and unresolved issues. Clearly distinguish completed, not-applicable, and blocked phases.
