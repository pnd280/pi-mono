# Subagent test coverage for maintainers

[Package](../README.md) · [Testing policy](../../../../docs/agents/testing.md#coverage)

This package tests [task](../GLOSSARY.md#tasks-and-processes) policy through real offline Pi [supervisors and RPC children](../GLOSSARY.md#tasks-and-processes); Pi owns host internals, and libs and utils own shared algorithms. An ID such as (J1) is a stable label of the invariant, which some test names and comments cite.

## Must not regress

### Launch, capacity, and tools

- **Critical, e2e:** Untrusted project settings cannot affect launch configuration or the `subagent` description, and cannot turn on `jobs`.
- **Critical, e2e:** Children receive the supervisor's project-trust flag.
- **High, e2e:** Foreground calls report the child's final text and correct state.
- **High, e2e:** Launch failures include the failed step, exit code, and stderr.
- **High, e2e:** Active children stay within configured [capacity](../GLOSSARY.md#tasks-and-processes), and queued launches start in FIFO order.
- **High, e2e:** A launch into a full queue fails with `launch queue is full`.
- **High, e2e:** (S3) Descendants respect configured depth and whole-tree capacity. Full nested launches fail immediately, and failed or exited subtree slots let the top-level FIFO continue.
- **High, e2e:** (S3) A resumed child has `subagent` and `subagent_abort` below `maxDepth` and does not have them at `maxDepth`, also when its session recorded them.
- **High, e2e:** When an extension that loads earlier turns `subagent`, `subagent_abort`, `job`, or `job_abort` off at session start, they stay off. The session-start registration with the session's docs and exposure does not turn them on again.

### Stops and session changes

- **High, e2e:** Completed tasks, turn aborts, user aborts, session changes, and graceful supervisor exits leave no child processes, including children that block shutdown.
- **High, e2e:** After supervisor SIGKILL, cooperative children stop through stdin EOF.
- **High, e2e:** A [forced stop](shutdown.md) continues after the child exits until the child's process group is gone. A member of the group that ignores SIGTERM and outlives the child receives SIGKILL after the grace period, before the call returns.
- **High, e2e:** A forced stop that leaves the child's process group is reported, also when another process holds the child's output pipes.
- **High, e2e:** A child supervisor forwards a forced-stop failure among its other stderr output, so a descendant's failure reaches the task above it.
- **High, e2e:** A task's forced-stop failure during the supervisor's session end is reported as an error of the shutdown handler.
- **High, e2e:** After a forced-stop failure, a cancelled task stays cancelled, and its result names the failure. `subagent_abort` returns the error instead of a confirmation.
- **High, e2e:** Tree selection (including a same-path rewind), parent-session fork, and saved-session switch immediately stop owned running subtrees, including children that block shutdown and detached [descendants](../GLOSSARY.md#tasks-and-processes).
- **High, e2e:** Late captures, completions, and controls cannot affect the replacement binding after a session change.
- **High, e2e:** After another extension cancels a tree navigation or a parent-session fork, `/subagents list` and new `subagent` calls work on the same ancestry, and a job result that waited arrives once in the next run.
- **High, e2e:** When a session change starts while the run waits for a [held job](jobs.md#held-jobs), the wait ends and the job continues. If another extension cancels the change, the job's result arrives once in the next run.
- **High, e2e:** Ordinary foreground abort stops only its foreground subtree, and new messages leave children running.
- **High, e2e:** (S5) Cancellation and graceful shutdown stop subtrees even during background and settle waits.
- **High, e2e:** (S5) Supervisor SIGKILL leaves no cooperative descendants under the documented cleanup limit.
- **High, e2e:** (S9) `subagent_abort` stops an owned active task, releases its capacity, and keeps it resumable.
- **High, e2e:** (S9) `subagent_abort` rejects foreign and inactive tasks.
- **High, e2e:** (S9) `subagent_abort` returns a successful confirmation and delivers no separate `cancelled` result, and the supervisor stops waiting when no task remains.
- **High, e2e:** (T5) Late updates from a disposed task view or connection cannot affect a replacement task view or session.

### History and leases

- **Critical, integration:** Invalid UTF-8 or JSON in complete child records, ambiguous ancestry, and replaced child files are never accepted as the recorded task's valid session.
- **Critical, integration:** Child-file reads leave the file bytes unchanged.
- **High, e2e:** The [selected parent ancestry](../GLOSSARY.md#history) supplies each task's latest [run](../GLOSSARY.md#tasks-and-processes) and its descendants.
- **High, e2e:** Running tasks recover stopped, including after restart or fork, and a run without an `end` entry shows as cancelled.
- **High, e2e:** Explicit resume keeps the task ID, session ID, and session file, continues the selected run in the same [child file](../GLOSSARY.md#history), and excludes later runs.
- **High, e2e:** Explicit resume warns about incomplete tool cycles without replaying old calls.
- **High, e2e:** A resume that omits `model` or `thinking` sends the child's provider requests with the value that the task's latest run on the selected ancestry requested, not the applied value, the supervisor's current selection, or the selection of a later run. A value in the call replaces only its own field.
- **High, e2e:** Historical views leave child files unchanged.
- **High, e2e:** Saved supervisor history grows by bounded [per-run records](adr/0003-keep-task-history-in-child-sessions.md#records), independent of the child's message count.
- **High, e2e:** Nothing is written under `<agentDir>/pi-subagents/`, and no lease directory remains after the runs end.
- **High, e2e:** Only one process, the holder of the [writer lease](../GLOSSARY.md#history), writes a task's child file. A forked supervisor cannot resume a task while the original child runs, also after the original supervisor is killed, and the file stays unchanged.
- **High, e2e:** After the lease writers exit, the next resume succeeds and removes the stale lease entries.
- **High, integration:** After a release cannot remove its lease entry, the same process can take the lease again, and a lease that it holds still excludes another writer.
- **High, integration:** History and lease reads reject non-regular files without blocking and enforce byte limits.
- **High, e2e:** (S6) Descendant records read from child session files preserve ownership across restart.
- **High, e2e:** (S10) While a task runs, also after a restart, `list` still shows the descendants of the task's earlier runs, and it never shows a descendant that is starting or running as stopped.

### Usage

- **High, e2e:** Launches and resumes report the child's usage for that call exactly once.
- **High, e2e:** A delivered [background result](../GLOSSARY.md#results) adds its [late usage](../GLOSSARY.md#results) once, also through a nested supervisor and after an extension reload.
- **High, e2e:** A task's total adds each run's usage once, live and after restart, including the usage of a child's compaction.
- **High, unit:** Missing or unchanged usage snapshots add no usage.
- **High, unit:** Model IDs that contain a slash retain their full ID.

### Background results

- **High, e2e:** (S1) Background runs deliver exactly one background result to their owning supervisor while busy, waiting, idle, or settling in print or JSON mode.
- **High, e2e:** (S1) Idle delivery uses prepared model context.
- **High, e2e:** (S1) In RPC, print, and JSON modes, a waiting supervisor continues after the first result while slower tasks run.
- **High, e2e:** (S1) In print and JSON modes, a result that is ready when the final reply fails without recovery still reaches the model.
- **High, e2e:** (S1) A turn abort cancels a background call whose child has not started. The call returns `cancelled`, and no background result follows.
- **High, e2e:** (S2) [Promotion](../GLOSSARY.md#tasks-and-processes) of foreground work releases the call and preserves the task across turn abort.
- **High, e2e:** (S2) A promoted call reports work before it returns, and the delivered background result adds only the late usage.
- **High, e2e:** (S4) A child's final result reaches its supervisor only after its background descendants finish and their results reach the child, also after a final error without retry.
- **High, e2e:** (S7) Compaction retains direct task IDs in model context without starting a new turn.
- **High, e2e:** (S8) New follow-up or steering input and an abort end a background wait without cancelling tasks. After an abort, the later result arrives when idle.
- **High, e2e:** (S8) A retryable failure retries without a wait.

### Jobs

- **Critical, e2e:** (J4) `job` uses the `shellPath` and `shellCommandPrefix` settings.
- **Critical, e2e:** (J4) When another extension owns `bash`, `job` and `job_abort` are hidden.
- **Critical, integration:** (J5) The job log reader refuses a symbolic link, a special file, and a file that replaced the log path after the reader checked it.
- **High, e2e:** (J1) A [job](../GLOSSARY.md#tasks-and-processes) delivers exactly one background result to its supervisor when the supervisor is busy, idle, or settling after an abort.
- **High, e2e:** (J1) The supervisor settles while a job without `hold_run` runs.
- **High, e2e:** (J6) A print run waits for a [held job](jobs.md#held-jobs), and the job's result continues the run before it ends.
- **High, e2e:** (J1) A timeout gives a `failed` result.
- **High, e2e:** (J1) After compaction, the reminder keeps the job IDs in model context.
- **High, e2e:** (J1) A result that arrives during a turn with tool calls follows the configured [delivery timing](background-results.md#delivery-timing) within the same run.
- **High, e2e:** (J2) `job_abort` stops the whole process group of an owned active job and delivers no separate result.
- **High, e2e:** (J2) `job_abort` rejects unknown and inactive jobs.
- **High, e2e:** (J2) A turn abort leaves jobs running.
- **High, e2e:** (J2) Tree navigation, fork, session switch, reload, graceful exit, and the end of a print, JSON, or child run leave no process of the job's process group.
- **High, e2e:** (J3) After a restart, [recovered jobs](jobs.md#job-history) match the [selected ancestry](../GLOSSARY.md#history), and a job without a saved end shows as cancelled.
- **High, integration:** After a job stops and after `Jobs.shutdown()`, no process in its process group remains alive, including background processes started by its shell.
- **High, integration:** Pending job-log output stays bounded when writes stall, and overflow stops the job with an explicit failed result instead of exhausting supervisor memory.

### Input, routing, and commands

- **Critical, e2e:** (R2) Only owned tasks receive input.
- **Critical, e2e:** (R2) Descendant routing preserves the result destination.
- **Critical, e2e:** (R2) Only the supervisor that launched a task resumes it after it stops; ancestors and foreign supervisors cannot.
- **High, e2e:** A supervisor cannot resume or abort another supervisor's tasks, and no input reaches them.
- **High, e2e:** Child dialogs reach the supervisor's client, and answers reach the requesting child with the selected value preserved even when sanitised labels collide.
- **High, e2e:** (S6) Abort and background commands reach only owned descendants, and nested dialog answers return to the requesting child.
- **High, e2e:** (R1) Active-task input reaches the same conversation once across running, settling, and exit races, without another capacity slot or duplicate usage or completion.
- **High, e2e:** (R1) The result of a run that took active-task input keeps the final reply that the input followed, before the input's reply.
- **High, e2e:** (R3) Read-only `show` paging covers eligible items on the selected run's ancestry once, including tool summaries that complete after a cursor was given out, with correct cursors and ancestry-scoped cumulative usage.
- **High, e2e:** (R3) `show` excludes thinking, arguments, and outputs.
- **High, e2e:** (R4) After an abort during a tool call, `show --last` returns the text and cursor of the latest assistant message with content, and skips empty `error` messages.

## Not tested

- Late updates outside the connection boundary are not tested because the [late-update test](../validation/activity.test.ts) covers only that boundary. The untested cases include a replaced terminal task view, a delayed filesystem read, an injected failed response, and other late event kinds.
- A delayed file read of an earlier run is below the severity bar; see [ADR 0003](adr/0003-keep-task-history-in-child-sessions.md#delayed-reads).
- Pi owns RPC framing, prompt-disposition semantics, lineage, and its internal trust enforcement.
- macOS and Windows are not tested because the tests run only on Linux. The forced-stop failure test also needs `perl` to put a process into another process group.
- Coordination-protocol races during settlement and stdin EOF, and reads of large branched child files, are not tested automatically. [ADR 0003](adr/0003-keep-task-history-in-child-sessions.md#runtime-checks) records the one-time probes and the open checks for these cases.
- A child that blocks shutdown can survive supervisor SIGKILL, because no independent watchdog exists to stop it.
- Card appearance, the activity that cards and panel rows name, task-list pagination, and the panel shortcut are below the severity bar.
- Job card appearance, the widget's job count, panel job rows, and the job log viewer are below the severity bar.
- A job process that leaves its process group is not tested because job cleanup does not stop it.
- A cancelled session switch and a cancelled or failed branch summary are not tested because the fixtures cancel only tree navigation and parent-session forks.

## Manual checks

For cards, the task panel, viewers, the widget, and command output in a terminal, use the [terminal checks](validation.md).
