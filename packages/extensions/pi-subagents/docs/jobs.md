# Background jobs

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

Set [`jobs`](../README.md#configuration) to `true` to give the model the `job` and `job_abort` tools. A [job](../GLOSSARY.md#tasks-and-processes) runs one shell command in the background, for example a build, a test run, a server, or a watcher. A job is not a task: it has no child, no capacity slot, no model, and no usage. There is no limit on the number of jobs. The design is in [ADR 0005](adr/0005-background-jobs.md).

## Start a job

The model calls `job` with a `command`, a short `description`, and an optional `timeout` in seconds. The timeout must be more than 0 and at most 2,147,483 seconds; there is no default timeout. The call returns immediately with the job ID and the path of the job's log file. The command runs with Pi's built-in `bash` implementation in the session's working directory, and it uses Pi's `shellPath` and `shellCommandPrefix` settings. At the timeout or at an abort, Pi stops the process group of the command's shell.

- `jobs` applies at all depths: `maxDepth` does not hide the job tools. The tools are model-only, so codemode scripts cannot call them.
- A job belongs to the session that started it. A supervisor does not see the jobs of its descendants.
- With [pi-agent-summary](../../pi-agent-summary/README.md#counters), the run summary shows `started N jobs`. Each accepted `job` call counts once, also when the command then fails to start.

## Job results

The supervisor does not wait for jobs: a run settles while its jobs run. When a job exits, its background result arrives as a `pi-subagents.job-result` message. If the supervisor is busy, the result joins the run in the same way as a [task result](background-results.md). If the supervisor is idle, the result starts a new turn.

The result contains a `<job>` envelope with the job ID, the outcome, and the exit code. Then it contains the last 2,000 lines or 50 KiB of output. After a failure, Pi's status line follows, such as `Command exited with code 2` or `Command timed out after 60 seconds`. An `Error:` line follows when the job's error adds to that text, such as a signal name or a log write failure. The log file path comes last.

| Exit              | Outcome     | Example error                            |
| ----------------- | ----------- | ---------------------------------------- |
| Exit code 0       | `completed` | none                                     |
| Another exit code | `failed`    | `exit code 2`, `exit code 143 (SIGTERM)` |
| Timeout           | `failed`    | `timed out after 60 s`                   |

A shell reports a signal as 128 plus the signal number. Thus the error names the signal, but the command can also exit with that code itself.

## Stop a job

A turn abort does not stop jobs. The model calls `job_abort` with a `job_id` when it does not need the result. The call stops the job's process group and returns the log file path. The model receives no separate `cancelled` result. If the job exited first, the call says so, and the actual result arrives separately. Unknown and inactive jobs give an error.

**Ctrl+D** in the [task panel](interface.md#jobs-in-the-panel) and `/subagents abort <job_id>` also stop a job. Then the `cancelled` result is delivered.

Jobs also stop without a result in these cases:

- Tree navigation to a different entry, parent-session fork, session switch, `/new`, `/resume`, `/reload`, and exit stop all jobs of the session. These jobs deliver no result. Jobs stop only when the change is final: if another extension cancels a navigation, the jobs continue.
- Print and JSON supervisors and children do not wait for jobs. Their jobs stop when the run ends, and the results are lost. In these modes, the `job` description tells the model to use jobs only for processes that it needs during the run, such as a server that it tests, and to run finite commands in the foreground.

## Job history

The supervisor saves a `pi-subagents.job` entry when a job starts and a `pi-subagents.job-end` entry when the job ends. These are two small entries for each job, whatever the command writes. The jobs on the selected ancestry come from these entries. A job without an end entry, such as a job that stopped at exit, shows as `cancelled`. Jobs never restart.

Successful compaction adds a hidden reminder that lists the jobs on the selected ancestry with their IDs, states, outcomes, and exit codes. To list jobs yourself, use [`/subagents jobs`](commands.md#job-pages).

## Log files

Each job writes all its output to `pi-job-<job_id>.log` in the OS temporary directory. On Linux and macOS, only the owner can read and write the file. Windows ignores the file mode, so the file gets the access rules of the temporary directory.

- The file has no size limit and is not automatically deleted, so a job with much output can fill a small temporary file system, such as a tmpfs.
- When the output is larger than Pi's `bash` output limits, Pi also writes all of the output to its own `pi-bash-*.log` file, which is not automatically deleted. Such a job uses the disk space two times.
- If the file cannot be created, the `job` call fails and no command starts. A later write error stops the job and makes it `failed`.
- Log writes cannot slow down a command. When a command writes faster than the disk accepts, the unwritten output stays in memory.

## Limits

- A job stops only the process group of its shell. A process that leaves the group, for example with `setsid` or a launcher that becomes a daemon, continues after its job stops. Its later output does not go to the log. Keep each process in the foreground of its command.
- If another extension registers `bash`, for example a sandbox, `job` and `job_abort` are hidden and a warning appears. Otherwise a job would run its command outside that extension. The check runs when settings load; an extension that registers `bash` later is not detected, and jobs continue to use Pi's built-in shell.
- The conversion of Git Bash, MSYS, Cygwin, and WSL `shellPath` forms for jobs on Windows is untested and not officially supported.
- Job entries over 1 MiB are ignored during recovery.
