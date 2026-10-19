---
name: typescript-review
description: "Review TypeScript code"
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
references:
  - ../code-review-expert/SKILL.md
  - ../typescript-advanced-types/SKILL.md
  - ../typescript-taste/SKILL.md
---

# TypeScript Review

Use `code-review-expert` as the main skill, `typescript-advanced-types` as the type-system companion, and `typescript-taste` for coding-style guidance.

## Scope and mode overrides

These rules override the companions' scope defaults, review-only mode, confirmation steps, and diff-specific reporting assumptions:

- Use the target supplied by the user or invoking workflow: paths, symbols, features, repository scope, or a Git range. Continue with that target even when the working tree is clean; an empty diff is not a reason to ask for a different target.
- With no supplied target, review staged, unstaged, and non-ignored untracked changes. Ask for a target only when none of those changes exist.
- Explicit audit-only instructions take precedence. Otherwise, implementation requested by the user or authorized by the invoking workflow requires applying evidence-backed, in-scope fixes without repeat approval. Update affected consumers, tests, and documentation together and verify the changes. Without implementation authorization, report findings without edits.
- Replace the final implementation-confirmation menu with findings or implementation results. Ask only when a material ambiguity or work outside the supplied authorization requires a decision; continue independent authorized work.

## Review and report

- Follow `code-review-expert` for review criteria and severity, subject to the overrides above.
- Apply `typescript-advanced-types` as the type-system companion over the same scope.
- Apply `typescript-taste` as coding-style guidance over the same scope. For stylistic choices where companions disagree, follow established project conventions first, then `typescript-taste`.
- Keep style-only suggestions optional and separate from evidence-backed findings. A style difference alone is not a defect and does not justify unrelated cleanup.
- Cross-check both directions: runtime assumptions against type contracts, and type guarantees against actual behavior. Feed findings back into the other pass.
- Reconcile into one report, deduplicating findings by root cause. Report the target and actual coverage rather than assuming changed lines. Include runtime and type evidence, applied fixes or proposed changes, exact verification results, and unresolved findings or coverage gaps.
