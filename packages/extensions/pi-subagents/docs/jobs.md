# Background jobs

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

Set [`jobs`](../README.md#configuration) to `true` to give the model the `job` and `job_abort` tools. A [job](../GLOSSARY.md#tasks-and-processes) runs one shell command in the background, for example a build, a test run, a server, or a watcher. A job is not a task: it has no child, no capacity slot, no model, and no usage. There is no limit on the number of jobs.

The design is in [ADR 0005](adr/0005-background-jobs.md) and [ADR 0007](adr/0007-own-job-processes-and-bound-logs.md).

## Start a job

The model calls `job` with a `command`, a short `description`, and an optional `timeout` in seconds. The timeout must be more than 0 and at most 2,147,483 seconds; there is no default timeout. The call returns immediately with the job ID and the path of the job's log file. The command runs in the session's working directory, with the environment that Pi supplies to its `bash` tool and Pi's `shellPath` and `shellCommandPrefix` settings.

- `jobs` applies at all depths: `maxDepth` does not hide the job tools. The tools are model-only, so codemode scripts cannot call them.
- A job belongs to the session that started it. A supervisor does not see the jobs of its descendants.
- With [pi-agent-summary](../../pi-agent-summary/README.md#counters), the run summary shows `started N jobs`. Each accepted `job` call counts once, also when the command then fails to start.

## Job results

The supervisor does not wait for jobs, and a run settles while its jobs run. When a job exits, its background result arrives as a `pi-subagents.job-result` message. If the supervisor is busy, the result joins the run in the same way as a [task result](background-results.md). If the supervisor is idle, the result starts a new turn.

The result contains a `<job>` envelope with the job ID, the outcome, and the exit code. Then it contains the last 2,000 lines or 50 KiB of output. After a failure, Pi's status line follows, such as `Command exited with code 2` or `Command timed out after 60 seconds`. An `Error:` line follows when the job's error adds to that text, such as a signal name or a log write failure. The log file path comes last.

| Exit              | Outcome     | Example error                            |
| ----------------- | ----------- | ---------------------------------------- |
| Exit code 0       | `completed` | none                                     |
| Another exit code | `failed`    | `exit code 2`, `exit code 143 (SIGTERM)` |
| Timeout           | `failed`    | `timed out after 60 s`                   |

A shell reports a signal as 128 plus the signal number. Thus the error names the signal, but the command can also exit with that code itself. A log write failure or process cleanup failure makes the outcome `failed`, including when the shell exited with code 0.

## Stop a job

| When                                                                                                             | Result                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The model calls `job_abort` with a `job_id` because it does not need the result.                                 | The call waits for process cleanup and returns the log file path. The model receives no separate `cancelled` result. |
| You press **Ctrl+D** in the [task panel](interface.md#jobs-in-the-panel) or run `/subagents abort <job_id>`.     | The job stops, and its `cancelled` result is delivered.                                                              |
| The timeout passes.                                                                                              | The job stops, and its `failed` result is delivered.                                                                 |
| Tree navigation to a different entry, parent-session fork, session switch, `/new`, `/resume`, `/reload`, or exit | All jobs of the session stop, and they deliver no result.                                                            |
| A print or JSON supervisor or a child ends its run.                                                              | Its jobs stop, and their results are lost, because these supervisors do not wait for jobs.                           |

In print and JSON modes and in children, the `job` description tells the model to use jobs only for processes that it needs during the run, such as a server that it tests, and to run finite commands in the foreground.

Edge cases:

- A turn abort does not stop jobs.
- If the job exited before `job_abort`, the call says so, and the actual result arrives separately.
- `job_abort` gives an error for unknown and inactive jobs.
- If process cleanup fails, `job_abort` returns an error, and the job delivers its `failed` result.
- Jobs stop for a session change only when the change is final. If another extension cancels a navigation, the jobs continue.

### Process cleanup

On Linux and macOS, shell exit, timeout, abort, and session shutdown all stop the job's process group. Cleanup continues after the shell exits, including for background members that hold no output pipe. It sends SIGTERM, then SIGKILL after 2 seconds if members remain. The job stays active until the group is gone or a cleanup failure is reported.

On Windows, pi-subagents waits for `taskkill /F /T` and reports its errors. The [parent-exit limit](#limits) still applies.

If Pi exits because the terminal is gone or a fatal error occurs, pi-subagents still attempts to stop all owned jobs. On Linux and macOS, it sends SIGKILL immediately, with no grace period. On Windows, it launches detached `taskkill /F /T` and does not wait for it.

## Job history

The supervisor saves a `pi-subagents.job` entry when a job starts and a `pi-subagents.job-end` entry when the job ends. The jobs on the selected ancestry come from these entries. A job without an end entry, such as a job that stopped at exit, shows as `cancelled`. Jobs never restart.

After compaction, a hidden reminder lists these jobs; see [side effects](../README.md#side-effects). To list jobs yourself, use [`/subagents jobs`](commands.md#job-pages).

## Log files

Each job writes its output to `pi-job-<job_id>.log` in the OS temporary directory. The file holds at most 16 MiB, including its omission marker. When another write would exceed the limit, the file keeps the newest 8 MiB of output and starts with `[Earlier output omitted: N bytes]`. `N` is the total number of output bytes removed. The file then grows again within the limit. There is no line limit on disk.

The live viewer follows the same file, which refreshes about once a second. It shows up to the last 2,000 lines or 50 KiB and includes the disk omission marker at the start of that window. Press **Home** to see it. A separate `[Earlier output omitted]` line means the displayed window excludes more output that is still in the file. A refresh during compaction can show part of the rewrite; the next refresh reads the current tail.

- On Linux and macOS, only the owner can read and write the file. Windows ignores the file mode, so the file gets the access rules of the temporary directory.
- Files are not automatically deleted. Many retained job logs can still fill the temporary file system; remove files that you no longer need.
- A job creates no second `pi-bash-*.log` file.
- If the file cannot be created, the `job` call fails and no command starts. A later write or compaction error stops the job and makes it `failed`.
- The job keeps at most 16 MiB of pending log writes in memory. If the next output chunk would exceed that limit, the job stops with a `failed` result and the error `Log file write failed: Pending log output exceeded 16 MiB`. It discards the pending queue and saves no later output.

## Limits

- Keep each process in the foreground of its command. A process that leaves the job's process group, for example with `setsid` or a launcher that becomes a daemon, is outside the job's cleanup.
- Supervisor SIGKILL bypasses the hard-exit cleanup in [process cleanup](#process-cleanup). A hard exit cannot wait for termination or log writes, so pending output can be lost. There is no independent watchdog.
- After group cleanup, output pipes close at EOF, after 100 milliseconds without output, or after 2 seconds at the latest. A pipe that does not reach EOF makes the job fail with an incomplete-output error.
- On Windows, there is no Unix process group. `taskkill /T` finds descendants through their parent, so descendants whose parent already exited are not stopped. A successful shell exit cannot confirm that all descendants stopped.
- If another extension registers `bash`, for example a sandbox, `job` and `job_abort` are hidden and a warning appears. Otherwise a job would run its command outside that extension. The check runs when settings load; an extension that registers `bash` later is not detected, and jobs continue to use their own shell runner.
- The conversion of Git Bash, MSYS, Cygwin, and WSL `shellPath` forms for jobs on Windows is untested and not officially supported.
- Job entries over 1 MiB are ignored during recovery.
