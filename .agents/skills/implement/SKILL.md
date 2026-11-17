---
name: implement
description: Implement a task when requirements are settled, review the changes with parallel code-review subagents, and report.
disable-model-invocation: true
metadata:
  opencode/autoinvoke: false
---

# Implement

Work autonomously from start to report: make each decision yourself and record it. Changes that repository policy reserves for user approval, such as a new test invariant, go into the report as proposals.

1. Note the uncommitted changes that already exist, then implement the task. Done when every requirement of the task is met and the checks that [verification](../../../docs/agents/verification.md) requires pass, apart from failures that existed before the change.
2. Review the changes with [code review](../code-review/SKILL.md).

   When subagent delegation is unavailable, run code review yourself on the task's changes and preserve the pre-existing changes. Done when every finding has an outcome and the verification checks pass; then go to step 5.

   Otherwise, split the task's changes into chunks with disjoint paths, such as one per package, and keep each change with its tests and docs. Split chunks so that each reviewer's diff fits in one tool output (50 KB). Review a new standard or rule that the task adds as a chunk of its own. Every subagent for a chunk gets its brief: the task, your implementation decisions, the autonomy rule above, the chunk's changed behaviour and paths, and the pre-existing changes in those paths to preserve.

   Fan out an audit-only code review, one subagent per chunk. Each subagent runs only the Audit phase, leaves the working tree as it found it, and returns every finding with its audit, `path:line` references, evidence, and planned action (revise, keep with a reason, decision needed, or unresolved). Done when every chunk has returned its findings and the working tree is unchanged.

3. Reconcile the findings of all chunks:
   - Merge findings that share a root cause across chunks, and combine conflicting findings on the same code into one planned change.
   - Decide each "decision needed" finding yourself, or make it a proposal when repository policy reserves it for user approval.
   - Assign each finding to revise to the chunk that owns its paths, and record each edit that crosses chunks.

   Done when every finding has a final planned action.

4. Fan out the fixes to new subagents, one per chunk with findings to revise. Each subagent gets its brief and its reconciled findings, and has sole edit ownership of its chunk:
   - It starts at the code-review Revise phase with the reconciled findings as its findings list, then runs Finish.
   - It reports edits needed outside its chunk. After all subagents return, apply those edits and the edits that cross chunks.
   - It returns every finding with its outcome (applied, kept with a reason, or unresolved), each new finding that a revision introduced, and its decisions.

   Done when every finding has an outcome and the verification checks pass on the combined diff.

5. Report as [verification](../../../docs/agents/verification.md) requires, and add:
   - each review finding and its outcome;
   - the decisions made during implementation, reconciliation, and fixes;
   - the proposals that wait for user approval.

   When the user approves a proposed invariant after the report, add the invariant and its test as the [testing policy](../../../docs/agents/testing.md#coverage) requires, then run steps 2 to 4 on them before you report again.
