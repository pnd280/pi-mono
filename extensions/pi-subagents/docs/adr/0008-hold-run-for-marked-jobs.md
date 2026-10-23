# Hold the run for jobs that the model marks

[pi-subagents](../../README.md) · [Background jobs](../jobs.md)

This decision supersedes two decisions of [ADR 0005](0005-background-jobs.md): that jobs do not hold the run, and that the working message does not show jobs. It leaves job processes, logs, result content, delivery timing, and session entries unchanged.

## Problem

ADR 0005 rejected a hold for all jobs, because a server or a watcher does not exit. Without a hold, print and JSON [supervisors](../../GLOSSARY.md#tasks-and-processes) and children stop their jobs when the final reply ends the run, and the results are lost. Their `job` description told the model to run finite commands in the foreground. Thus a child could not run a build or a test run beside other work and still use the result. At the top level, a job result that arrived after the run settled started a new turn instead of continuing the run.

## Decision

### The flag

- `job` takes an optional `hold_run` boolean, `false` by default.
- The model sets `hold_run` for a command that exits by itself and whose result it needs before it finishes.
- `hold_run` does not require a `timeout`. A hold on a command that does not exit has the same effect as a foreground `bash` call on that command.
- Only the live job keeps the flag. The job entry and the tool details do not contain it, because jobs never survive a reload or a restart.

### The hold

- A live job started with `hold_run` holds the run in the same way as a direct background task in [ADR 0001](0001-hold-run-for-background-results.md). The jobs' [result source](../../GLOSSARY.md#results) reports the hold.
- A job stays live until its process cleanup and log closure end. The registry removes it and publishes its result in the same synchronous step, so the wait cannot end between the two.
- Nothing holds the run while delivery is suspended for a pending session change. A suspended delivery cannot deliver the result.
- The suspension check also prevents a deadlock. In Pi 1.4.0, a session switch or a new session emits its pre-event first, then aborts the run and waits for idle. A child or a print or JSON supervisor that waits in `agent_before_settle` has no abort signal, so without the check the change would wait until the held job exits.

### What the model and the user see

- The working message reads "Waiting for background results" for tasks and held jobs.
- The `job` description names `hold_run`. In children and in print and JSON modes, it tells the model to set `hold_run` for a command whose result it needs, and to use other jobs only for processes that it needs during the run.
- The start text says whether the run waits for the job.
- The job card and the pi-tool-display card do not show the flag.

## Considered options

### Require `timeout` with `hold_run`

Rejected. A timeout limits a wrong hold in print mode, but the model must guess how long a build takes, and a short timeout fails a valid run. The risk is the same as for a foreground `bash` call, which **Esc**, new input, or a parent's abort ends.

### Hold by default in children and in print and JSON modes

Rejected. A wrong hold can hang a run, while a missing hold only loses or delays a result. A default that depends on the mode is also harder for the model to use correctly.

### Name the parameter `expect_to_end`

Rejected. The name states a guess about the command, not the effect on the run. `hold_run` uses the term of the code and of these ADRs.

## Consequences

- At the top level, the run stays busy until a held job's result arrives, so commands that need an idle session are blocked during the wait.
- A model that sets `hold_run` on a server or a watcher keeps the run busy until **Esc**, new input, a timeout, or an abort of the job.
- After another extension cancels a session change, held jobs do not hold the run that was active during the change.

## Verification

Two e2e cases cover the decision. In the first, a print run waits for a held job. A spy on the result source releases the job only when delivery asks whether the run is held, and the job's result continues the run. Without the hold, the run ends with no result. In the second, a cancelled fork during a held wait ends the wait while the job runs, and the result arrives once in the next run. Without the suspension check, the second case waits until its timeout. The deadlock of a session switch in a settle wait was found by reading the Pi 1.4.0 source; no case reproduces it.
