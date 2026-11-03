---
name: code-review
description: Audit targeted code or recent changes through sequential UI consistency, reusability, TypeScript, coding style, test, and documentation audits, then revise it from the findings.
---

# Code review

Review code in two separate phases. The Audit phase runs the six audits below and changes no project files. The Revise phase then applies the audit findings. Invocation authorises evidence-backed, in-scope revisions, including test cleanup. Under explicit audit-only instructions, stop after the Audit phase and report.

## Scope

- Never change a locked skill, even when a finding targets it. A locked skill is a skill directory that [`skills-lock.json`](../skills-lock.json) lists, such as `_aux/code-review-expert/`. Do not edit, add, move, or delete its files, and do not edit `skills-lock.json`. Report the finding as unresolved instead.
- Use supplied paths, symbols, features, or a Git range as the target.
- Otherwise, use the initial staged, unstaged, and non-ignored untracked changes. If none exist, use the latest commit's changes.
- Record and freeze this initial scope before the Audit phase. For change-based targets, focus on changed behaviour and its enclosing implementation, not every unrelated issue in touched files.
- Inspect related implementations, consumers, tests, and documentation as needed. Edit outside the initial scope only when necessary to complete an in-scope revision correctly.
- Preserve unrelated work. Do not commit, stage, reset, or discard changes.

## Preparation

Read applicable repository instructions and [workspace development guidance](../../../docs/development.md). When the scope uses Pi APIs, also read the [Pi API contracts](../../../docs/agents/pi-apis.md). Record the initial Git state, scope, and relevant baseline diagnostics. Create a checklist of the six audits and the Revise phase.

## Audits

Resolve relative skill links from this file. Each audit names the skill steps that run in each phase. This split overrides the skills' default modes:

- In the Audit phase, every skill runs audit-only, including a skill that edits on invocation or under the invoking workflow's authorisation.
- In the Revise phase, this skill's invocation authorises the revise steps without repeat approval, including for a skill that edits only on user request.
- Skip the skills' confirmation steps. This skill's [Finish](#finish) replaces their verify-and-report steps, and the scope above replaces their default scope.
- Repository-required approvals still apply, including approval for new invariants under the [testing policy](../../../docs/agents/testing.md#coverage).

1. [UI consistency](../_aux/audit-ui-consistency/SKILL.md)
   Establish intended user-facing contracts and preserve intentional differences. Audit with stages 1 to 3; revise with stage 4. If no UI surfaces are relevant, record why this audit is not applicable.

2. [Reusability](../_aux/audit-reusability/SKILL.md)
   Find verified substitutions and justified shared extractions. Preserve consumer policy and ownership; do not propose abstractions merely because code looks similar. Audit with stages 1 to 3; revise with stage 4.

3. [TypeScript review](../_aux/typescript-review/SKILL.md)
   Review runtime correctness and type contracts together, using the main skill and both companions that the skill names. Audit without implementation authorisation, so that the skill reports each defect and the gap in types, lint, or tests that let it pass. Revise by fixing each defect and its gap. If no TypeScript is relevant, record why this audit is not applicable.

4. [Coding style](../_aux/audit-coding-style/SKILL.md)
   Find code that departs from established conventions. Preserve behaviour and avoid cosmetic churn without maintenance benefit. Audit with steps 1 and 2; revise with step 3.

5. [Tests](../_aux/audit-tests/SKILL.md)
   Preserve distinct regression protection, require evidence for removals, and record meaningful coverage gaps in the scope. Audit with steps 1 and 2; revise with step 3.

6. [Documentation](../_aux/audit-docs-v2/SKILL.md)
   Find inaccuracies, missing guidance, and problems of relevance, structure, and wording in documentation that the scoped behaviour affects, while preserving essential contracts. Audit with steps 1 to 4, and record each finding as a step 5 before → after pair in the findings list, not in a separate report. Revise with "Apply changes", then check the revised documentation with step 6. If no documentation is relevant, record why this audit is not applicable.

## Audit phase

Run the six audits in order over the frozen scope. Keep probes, injected defects, and notes in disposable copies or `.tmp/`.

For each audit:

- Read the skill and applicable references, and run its audit steps.
- Record each finding in one shared findings list, with its audit, classification, `path:line` references, evidence, and the fields that its skill requires.

Then reconcile the findings list:

- Merge findings that share a root cause, and keep the evidence from each audit.
- Combine conflicting findings on the same code, such as an extraction and a rename, into one planned change.
- Give each finding a planned action: revise, keep with a reason, decision needed, or unresolved for missing evidence.

The Audit phase is complete when every audit has a status, every finding has a planned action, and the working tree matches the initial Git state. Under audit-only instructions, go to [Finish](#finish).

## Revise phase

Apply the planned revisions in audit order, so that style, test, and documentation revisions apply to the code that earlier revisions produce. Use each audit's revise steps.

- Before each revision, check its finding against the current code. An earlier revision can resolve or change it.
- Update affected consumers, tests, and documentation together.
- Hold code that the revisions add or change to the same audit criteria. Record a new finding for each problem that a revision introduces, and fix it.
- Run relevant checks after each revision instead of only at the end. Fix regressions that your changes cause, and keep baseline failures explicit.
- Do not force edits when the evidence supports keeping the code. Change the planned action to keep and give the reason.
- Ask only when a material ambiguity, contract change, architectural redesign, or scope expansion requires a decision. Continue independent authorised work.

The Revise phase is complete when every finding has an outcome (applied, kept with a reason, or unresolved), and the relevant checks pass apart from baseline failures.

## Finish

Review the cumulative diff and complete [required repository verification](../../../docs/agents/verification.md). Confirm that your changes touch no file in a locked skill and leave `skills-lock.json` unchanged; revert any such change that you made. Report the scope, important changes and keep decisions, exact checks and results, and unresolved issues. Give each of the six audits its own line with the audit name, its status (fixed, no findings, open, not applicable, or blocked), and a short reason or result.
