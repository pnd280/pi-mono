# Run background jobs beside Pi's bash, without holding the run

[pi-subagents](../../README.md) · [Background jobs](../jobs.md)

A model needs long commands, such as builds, test runs, servers, and watchers, to run while it continues its work. A [job](../../GLOSSARY.md#tasks-and-processes) is such a command. It has its own `job` and `job_abort` tools, its own registry, and its own session entries. Built-in `bash` does not change.

The runner and full-output log policy below are superseded by [ADR 0007](0007-own-job-processes-and-bound-logs.md). [ADR 0008](0008-hold-run-for-marked-jobs.md) supersedes the decisions that jobs do not hold the run and that the working message does not show jobs, and the consequence that print and JSON supervisors and children never wait for jobs. The other tool, delivery, and session-history decisions remain in effect.

## Decision

- `job` runs the command with Pi's public `createBashToolDefinition` and a wrapper of `createLocalBashOperations`. The wrapper also writes the output to the job's log file. The job owns its abort controller, so a turn abort does not stop it. `job_abort` aborts that controller, and Pi then stops the shell's process group.
- Jobs do not hold the run. Only the [result source](../../GLOSSARY.md#results) of tasks holds it, while a direct background task runs, so jobs do not extend the wait of [ADR 0001](0001-hold-run-for-background-results.md).
- The working message does not show jobs.
- Task and job results share the delivery queue and the delivery boundaries of [ADR 0006](0006-deliver-background-results-at-turn-end.md).
- The result body names the job's error, such as `exit code 143 (SIGTERM)` or a log write failure, before the log file path. Pi gives the result's details only to the interface. Without this line, the model sees a log write failure only as `failed` with exit code 0. Pi's text already names a plain exit code, a timeout, an abort, or a start failure, so the body does not repeat these.
- Jobs stop only when a session change is final: at `session_tree` with a changed leaf and at `session_shutdown`. The pre-events do not stop jobs, because a later extension can cancel them.

## Considered options

### Override `bash` with `background` and `delivery` parameters

Rejected. pi-tool-display identifies native tools by object identity and `sourceInfo.source === "builtin"`, so an override loses its native shell cards and live previews. The override also needs a new libs contract, changes to the pi-tool-display host tests, and handling for codemode and for other extensions that override `bash`.

### Let the model start a process with `bash` and stop it by PID

Rejected. Pi does not expose the PID, so this needs our own spawn and loses Pi's exit cleanup. `kill <pid>` misses the other members of the process group, a PID can be reused, and the supervisor cannot drop the result of the model's own kill.

### Hold the run like ADR 0001

Rejected. A server or a watcher does not exit, so the supervisor would stay busy without end, and a child would never return.

## Consequences

- A run settles while its jobs run, and each job result can start one more model request.
- Print and JSON supervisors and children do not wait for jobs. Pi exits after their final reply, the jobs stop, and their results are lost. In these modes, the `job` description tells the model to use jobs only for processes that it needs during the run.
- A job that ends between a pre-event and its final event adds its end entry to the old branch. If the change becomes final, its pending result is dropped. If an extension cancels the change, the result waits for the next run.
- Pi stops only the shell's process group. A process that leaves the group continues after its job stops; see [job limits](../jobs.md#limits).
- A `bash` override that another extension registers after settings load is not detected.
