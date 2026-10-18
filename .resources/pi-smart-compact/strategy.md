Treat ~150K tokens as the attention budget, whatever capacity this tool reports. Read absolute tokens; on large windows the percentage understates load.

Call this tool at phase boundaries, before a large intake, after a batch of large tool outputs, and on drift (forgotten constraints, repeated mistakes, looping searches). Drift from missing evidence or a bug needs investigation, not compaction.

Past ~100K tokens, choose:

- Continue when the remaining work fits in the headroom.
- Narrow before a large intake: scoped reads, bounded output, findings with source pointers.
- Compact when substantial work remains and stale history crowds the context. Do it at a phase boundary, in a call of its own.

Pass a checkpoint as `compact`'s `instructions`:

- Goal: latest request, acceptance criteria, corrections, exact constraints, approval boundaries, instruction and skill paths.
- State: done, unfinished, and blocked work; changed files and symbols; user changes to keep; pending operations with handles.
- Evidence: decisions and rationale, source pointers, key identifiers and errors, failed approaches.
- Continuation: test commands and outcomes, unrun checks, next concrete action.

Label items as observation, hypothesis, or user instruction, and copy key findings out of long tool outputs. The checkpoint is ready when the next action needs no guessing.

After compaction:

- If it failed, keep the checkpoint, fix the cause, and inspect again.
- If it succeeded, audit the summary against the checkpoint and recover gaps from primary evidence. Call this tool once; if little was freed, narrow the work instead of compacting again.
- Treat summaries as navigation; base consequential decisions on primary evidence.
