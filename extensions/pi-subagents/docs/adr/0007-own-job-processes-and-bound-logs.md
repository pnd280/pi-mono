# Own job processes through cleanup and bound their logs

[pi-subagents](../../README.md) · [Background jobs](../jobs.md)

This decision supersedes the runner and full-output log policy in [ADR 0005](0005-background-jobs.md). It leaves job tools, result schemas, delivery timing, session entries, and task-child shutdown policy unchanged.

## Problem

Pi's public local bash operations return an exit code without a live process handle. A shell can start a quiet background process in its group and exit successfully. The old job then left the live registry, so neither job completion nor `Jobs.shutdown()` stopped that process. A Linux integration case reproduced the leak with a background member that ignored SIGTERM.

The old wrapper also wrote the full output to a job file and passed it to Pi's output accumulator. Large output created a second full log. The pending-write cap bounded the job stream's queue, but neither file had a size limit.

## Decision

The [job runner](../../src/jobs/process.ts) owns the shell handle from spawn through cleanup. It uses Pi's public `getShellConfig` to select the executable, arguments, and command transport. `createBashToolDefinition` still supplies the trusted command prefix, session environment, working directory, and timeout or abort status text. No private Pi API is needed.

On Linux and macOS, completion, timeout, cancellation, and session shutdown wait for the shell's process-group cleanup. The runner reuses `forceStop`, `stopRemainingGroup`, and `processOptions` from the [child platform module](../../src/child/platform.ts). Normal job cleanup does not change `ChildRun` policy. The existing process-group number reuse limit still applies.

On Windows, the runner waits for `taskkill /F /T` and reports launch errors and non-zero exits. Windows has no Unix process group, and the existing parent-exit limit remains. A process that leaves a Unix job group is also outside cleanup. These limits stay visible in the [job guide](../jobs.md#limits).

Pi's private detached-child tracker does not cover these owned operations. Each job registry instead keeps one synchronous Node `exit` listener while it owns shell handles or process groups, and removes the listener when the last group cleanup ends. This preserves cleanup for Pi's terminal-gone and fatal-error paths that call `process.exit()` without session shutdown. On Linux and macOS, the listener sends SIGKILL immediately, with no grace period. On Windows, it launches detached `taskkill /F /T /PID` from System32 with ignored stdio. This exit cleanup is best effort. It cannot wait for termination or log writes. Supervisor SIGKILL bypasses the listener.

A job remains active until cleanup and log closure finish. Cleanup failure produces a failed job result. `job_abort` returns the cleanup error, and `Jobs.shutdown()` rejects with the collected stop errors. A child supervisor also forwards these errors through the existing stderr cleanup records before exit. The session binding observes task and job shutdown together, then reports failures after both finish. A final session change still suppresses job end entries and results on the replacement ancestry.

### Bounded output

The [job log writer](../../src/jobs/log.ts) keeps one file of at most 16 MiB, including the omission marker. On overflow it rewrites the file with the newest 8 MiB of output and a cumulative omitted-byte count, then resumes appending within the cap. Keeping half the limit avoids rewriting the retained tail for every new chunk. There is no disk line limit.

The writer creates the private file exclusively and uses the same handle for every write and rewrite. It never reopens the path during compaction. A write or compaction failure fails the job. A rewrite is not an atomic snapshot. An active reader can see part of it until the next refresh. The log reader retains its regular-file, symbolic-link, and file-identity checks.

The pending-write queue is separately bounded at 16 MiB. Overflow aborts the process, discards the stalled queue, and reports a log write failure without waiting for that queue to drain. The result retains only a bounded output tail. No job output enters Pi's accumulator, so there is no second full log.

The live viewer keeps the disk omission count in its smaller display window. It follows the newest output by default; **Home** reveals the omission marker. The [log policy](../jobs.md#log-files) defines the displayed limits and file deletion rules. There is no automatic deletion or global disk budget across jobs.

## Rejected options

- Keeping the native operations cannot repair ownership after shell exit, because they expose no process handle. Wrapping shell text to keep a parent alive changes command semantics and still needs a separate stop owner.
- Killing only the shell PID misses the remaining group members. Saved PIDs also cannot establish live ownership after a restart.
- Keeping all output on disk leaves a long-running watcher able to exhaust the temporary file system. A pending-memory cap alone does not prevent it.
- Keeping a head excerpt would preserve old startup output at the cost of recent failures. Jobs retain the newest output, with the omitted-byte count making that loss explicit.
- Rotating to new paths would complicate saved log paths and reader identity. Rewriting through the original handle keeps one bounded file and the existing reader contract.

## Verification

The registry integration cases cover a background member after shell exit and after shutdown, and a stalled log writer whose pending queue reaches the bound. The shell-exit case fails with the old runner; the stalled-writer case fails with the cap disabled. Existing job e2e cases cover shell settings, timeout, abort, delivery, and session changes. The timeout case also checks that a later abort during group cleanup does not replace the established failed outcome or discard its result.

Disk retention and live-view behaviour use the [manual retention procedure](../validation.md#job-log-retention), with no automated retention test. Linux terminal checks covered regular and fullscreen modes, multiple compactions, the latest output, the omission count, and the absence of a duplicate Pi log. Windows and macOS were not run.
