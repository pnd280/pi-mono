# Task history and branches

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

Task state belongs to the supervisor's [selected ancestry](../GLOSSARY.md#history), and each task's conversation lives in one [child file](../GLOSSARY.md#history). The decision is in [ADR 0003](adr/0003-keep-task-history-in-child-sessions.md).

## Branch changes

Tree navigation, parent-session fork, and session switch immediately force-stop all owned running subtrees, including background work. Selecting the current leaf and sending ordinary messages leave tasks running. Restored tasks are stopped; they never restart automatically.

The tasks stop before the change, so they also stop when another extension cancels the change, or when a branch summary is cancelled or fails. Their runs show as `cancelled`. The supervisor can launch and resume tasks again at once on the same ancestry, and [jobs](jobs.md#stop-a-job) continue.

## Runs and entries

A task keeps one child session file for its whole life, and that file is the only copy of its conversation. A run is one child process, from launch to exit.

- The supervisor saves a `run` entry when a child starts and an `end` entry when it exits; it saves no other task state.
- The latest run of a task on the selected ancestry sets its state.
- A run without an `end` on that ancestry, such as a run stopped by navigation, supervisor exit, or a crash, shows as `cancelled` with unknown usage. Usage that a tool result already reported stays counted.

A run's history is the same on every parent branch. A parent branch that forked during a run shows the whole run as `cancelled`, including output and descendants after the fork point.

A child's descendants come from the `run` and `end` entries in its own session file; while the child runs, the descendants of its current run come from its live updates instead. `list`, `show`, and the open task panel read these files again, so they also show descendants that another process adds.

## Resume

Explicit resume continues the task's latest run on the selected ancestry, in the same child file as a new branch. Later runs, and user or custom messages that the run did not answer, are not part of the resumed context. `task_id`, `session_id`, and `session_file` stay the same for every run. A running child cannot navigate its tree, fork, or switch sessions.

An interrupted tool cycle produces a warning: old calls are not replayed automatically, completed effects remain, and the model can request the operation again. Only calls without a result in the run's last response that did not fail produce it; Pi does not run the calls of a failed or aborted response.

## Writer lease

While a run is live, a `<session_file>.lease/` directory names its supervisor and child processes. A resume fails with "Task is running in another process" while a process named in the lease is live, such as a child that outlived its supervisor. The supervisor removes the directory when the child exits.

- A crash can leave a `<session_file>.lease/` directory behind. A later resume removes stale entries when all the processes they name are dead. An entry replaced during this check prevents that resume, so the check cannot remove a newer entry that names a live child.
- An unreadable or malformed lease entry prevents resume. Lease entries must be regular files of at most 1 KiB.
- On Linux, an exited process that its parent has not reaped is not live.
- A reused process ID can block a resume until that process exits.
- If the supervisor cannot remove its lease entry when the child exits, its own next resume of the task removes it. A resume from another supervisor fails until this supervisor exits.
- The lease protects only cooperating supervisors; a manual `pi --session` on a child file is not covered.

## Manual changes

Editing or deleting a child file changes or removes the task's history. Continuing a child file manually extends the run that wrote its last entry. User-requested branch summaries can carry information from the branch being left, but summaries never supply task ownership.

History reads and resume check that the file's session ID matches the task. Invalid UTF-8 or malformed JSON in a complete line, duplicate entry IDs, and missing or forward parent links make the history unavailable. An unfinished final line is ignored because a live child can still be writing it. Readers never repair or write the child file.

## Limits

- Task entries over 1 MiB are ignored during recovery.
- History reads accept only regular files and are limited to 64 MiB for each child file.
- The full child session path is available in the list response.
