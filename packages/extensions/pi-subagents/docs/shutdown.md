# Process shutdown

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

A [child](../GLOSSARY.md#tasks-and-processes) stops after completion, cancellation, navigation, or a supervisor exit. Forced stops can leave processes alive under the [limits](#limits) below.

## Graceful stop

Completion closes child stdin; cancellation also clears queued input and requests abort. On explicit task cancellation, the supervisor reads the final usage before it closes stdin. It does not wait for blocked settle handlers.

Cancellation, the usage read, and shutdown share the same grace period. The grace period is 5 seconds plus 7 seconds per possible remaining descendant level, bounded by `maxDepth` and `maxConcurrent`. With default limits, children receive 12 seconds and grandchildren 5 seconds.

When the session ends, no task or job starts, saves an entry, or delivers a result, and tools, commands, and the panel see no session. pi-subagents then stops the children and jobs. For the order against other extensions' shutdown handlers, see the [shared lifecycle shutdown order](../../../libs/src/lifecycle/README.md#shutdown-phase).

Graceful exit waits for child-task cleanup. It also waits for each job's process-group cleanup, including after the job's shell exits, and for the job's log file to close. When a task's or job's forced stop fails, Pi reports an error of the pi-subagents shutdown handler after all stops end. Jobs get no stdin grace period; see [job stops](jobs.md#stop-a-job) and their [limits](jobs.md#limits).

### Process-group cleanup

On Linux and macOS, a live supervisor sends SIGTERM to the child process group after the grace period. It sends SIGKILL after 2 more seconds if a member remains, also when the child itself has exited. When the child exits without a forced stop and members of its group remain, the supervisor starts the same forced stop at once. The stop ends when the group is gone.

If a member remains 1 second after SIGKILL, or the group cannot be checked, the run's result reports the failure. A cancelled run stays cancelled and names it; a failed run's first line starts with it.

On Windows, the supervisor force-stops the child's process tree with `taskkill` at once.

### Output pipes

After the stop ends and the child exits, the supervisor waits for EOF on the child's output pipes. When another process still holds them, the supervisor closes them after no output arrives for 100 milliseconds, or at the latest after 2 seconds. Without EOF, more output could follow, so the result's first line then starts with `Output can be incomplete: the supervisor closed it before EOF`. A run that would complete fails, and a cancelled run stays cancelled.

Requests to the child that are still pending 1 second after its exit fail, also when its output pipes stay open.

### Descendant cleanup failures

A child supervisor writes the failed stops of its own tasks and jobs to stderr before it exits, each on its own line, and waits up to 1 second for the write. Its supervisor reads all of that stderr, not only the kept excerpt, and reports them in the result of that child's run.

## Immediate stop

Navigation and foreground abort use a separate immediate path. Unix stops the live owned tree during process discovery, then sends SIGKILL to its groups and descendants; Windows uses forced tree termination.

In both paths, capacity remains reserved until process exit is observed, and on Linux and macOS, until any forced stop of the child's process group ends.

## Supervisor hard exit

When Pi exits without a session shutdown, for example on some terminal-loss or fatal-error paths, pi-subagents attempts a best-effort stop of its owned jobs, which cannot wait for termination or log writes. See [job process cleanup](jobs.md#process-cleanup) and [job limits](jobs.md#limits).

Design: [ADR 0007](adr/0007-own-job-processes-and-bound-logs.md).

## Limits

- After supervisor SIGKILL, children rely on cooperative stdin-EOF shutdown. A child that blocks shutdown can remain alive with its commands, and there is no independent watchdog. For jobs, see [job limits](jobs.md#limits).
- Force-kill does not reverse file changes and can bypass child cleanup.
- A process that holds the child's output pipes in another process group delays the run's result until it exits, unless a forced stop ran.
- After the child exits, only the remaining members of its process group keep the group's number. If they all exit between a check and the next signal, and the system gives the number to a new group, that signal reaches the new group. Node.js has no process-group handle that prevents this.
- On Windows, the supervisor stops no process after the child's own exit; a process that holds the child's output pipes then delays the run's result until it exits.
- On Windows, `taskkill /T` finds descendants through their parent process, so a descendant whose parent already exited is not stopped.
- After a cancelled child exits, an active supervisor records the task's cancellation. The viewer retains saved tool results and reported response errors; other unfinished calls show "Interrupted" after any partial output. It does not invent an execution result or a duration.
