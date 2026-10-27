---
name: implement
description: Implement a task when requirements are settled, review the changes with parallel code-review subagents, and report.
---

# Implement

Work **autonomously** from start to report: make each decision yourself and record it. Changes that repository policy reserves for user approval, such as a new test invariant, go into the report as proposals.

1. Note the uncommitted changes that already exist, then implement the task. Done when every requirement of the task is met and the checks that [verification](../../../docs/agents/verification.md) requires pass, apart from failures that existed before the change.
2. Fan out [code review](../code-review/SKILL.md) to subagents, one per chunk:
   - Split the task's changes into chunks with disjoint paths, such as one per package. Keep each change with its tests and docs.
   - Give each subagent the task, your implementation decisions, the autonomy rule above, and its chunk's changed behaviour and paths as the code-review target. Name the pre-existing changes in those paths so that it preserves them.
   - Give each subagent sole edit ownership of its chunk. It reports edits needed outside the chunk, and you apply them after all subagents return.
   - Ask each subagent to return every finding with its outcome (applied, kept with a reason, or unresolved) and its decisions.

   Done when every finding has an outcome and the verification checks pass on the combined diff.

3. Report as [verification](../../../docs/agents/verification.md) requires, and add:
   - each review finding and its outcome;
   - the decisions made during implementation and review;
   - the proposals that wait for user approval.
