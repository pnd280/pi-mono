---
name: codebase-review
description: Review and improve medium, large, or high-risk changes in pi-mono for correctness, architecture, maintainability, test quality, runtime behavior, and documentation accuracy.
disable-model-invocation: true
---

# Codebase Review

Use `/skill:codebase-review` after an implementation. Arguments may identify packages, paths, a comparison base, or `review-only`. By default, review and fix concrete in-scope issues; `review-only` leaves files unchanged.

## References

Read the repository's [AGENTS.md](../../../AGENTS.md) and applicable package instructions.

Load companion skills only when a selected branch requests them. Resolve Pi's global skills directory in the shell as `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills/`. Look there and in any additional skill directories configured for the session for companion `SKILL.md` files. If a companion skill is unavailable, report the missing dependency and continue with repository conventions and the selected checks.

## 1. Establish scope and intent

- Inspect the working tree and supplied scope. Include staged, unstaged, and relevant untracked files. For committed work, use the supplied comparison base or one established by the task; do not silently assume `HEAD~1` or a particular branch.
- If no scope is supplied, use the current implementation's changes. Ask for scope only when the intended change cannot reasonably be identified.
- Identify intended user-visible outcomes, contracts, affected packages, and consumers of changed shared code. Read surrounding implementations and callers where needed; keep unrelated cleanup out of scope.
- Find affected documentation even when it is absent from the diff: package READMEs, package instructions, linked guides, and comments explaining constraints.
- Name the consequential failure modes and choose review depth by risk as well as size. Small changes to lifecycle handling, persistence, or shared contracts may need deeper review.
- For each meaningful changed behavior, identify existing evidence or a consequential gap. Run useful focused baseline checks. A failure observed before QA fixes is not necessarily pre-existing to the implementation; establish that distinction before reporting it.

For larger changes, delegate independent, read-only reviews of the affected areas below when collaboration tools are available. Give each reviewer the scope, intended behavior, applicable conventions, and a distinct responsibility. Prefer fresh context, and require findings to include a location, concrete consequence, and supporting evidence. Integrate findings before editing overlapping areas.

## 2. Review affected areas

Read every matching branch before reviewing or planning fixes. Select by affected behavior and consumers, not only edited filenames.

- When code, tests, dependencies, or tooling change, read [implementation-review.md](implementation-review.md) for architecture, correctness, performance, and test evidence review.
- When a change affects Pi APIs or host integration, lifecycle handling, TUI rendering or interaction, I/O, or persistent state, read [runtime-validation.md](runtime-validation.md) before checking integration and selecting runtime exercises.
- When documentation or explanatory comments change, or a change affects documented behavior, usage, configuration, side effects, code navigation, or validation instructions, read [documentation-review.md](documentation-review.md) before reviewing documentation, including affected documents outside the diff.

Distinguish defects and concrete maintenance costs from stylistic preferences. Do not invent findings to satisfy a quota.

## 3. Resolve findings and verify

Reproduce or substantiate findings before changing code. Make the smallest coherent in-scope fixes, preserving unrelated work. Report larger redesigns and unrelated issues separately rather than expanding the task. In `review-only` mode, report recommendations without applying fixes.

Report findings with locations and consequences, including unresolved issues, proposed broader changes, and material evidence gaps ordered by impact. Follow the repository's [verification and handoff workflow](../../../docs/agents/verification.md). Repeat checks only when new edits, failures, or unresolved concerns justify them.
