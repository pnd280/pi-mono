# Process shutdown

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

This guide explains how a [child](../GLOSSARY.md#tasks-and-processes) stops after completion, cancellation, navigation, or a supervisor exit, and what can survive.

## Graceful stop

Completion closes child stdin; cancellation also clears queued input and requests abort. Explicit task cancellation reads the final usage before closing stdin, without waiting for blocked settle handlers.

Cancellation, the usage read, and shutdown share the same grace period. The grace period is 5 seconds plus 7 seconds per possible remaining descendant level, bounded by `maxDepth` and `maxConcurrent`. With default limits, children receive 12 seconds and grandchildren 5 seconds.

On Linux and macOS, a live supervisor then sends SIGTERM to the child process group, followed by SIGKILL after 2 more seconds if needed. Graceful exit waits for cleanup.

## Immediate stop

Navigation and foreground abort use a separate immediate path. Unix stops the live owned tree during process discovery, then sends SIGKILL to its groups and descendants; Windows uses forced tree termination.

In both paths, capacity remains reserved until process exit is observed.

## Limits

- After supervisor SIGKILL, children rely on cooperative stdin-EOF shutdown. A child that blocks shutdown can remain alive with its commands; there is no independent watchdog.
- Force-kill does not reverse file changes and can bypass child cleanup.
- After a cancelled child exits, an active supervisor records the task's cancellation. The viewer retains saved tool results and reported response errors; other unfinished calls show “Interrupted” after any partial output. It does not invent an execution result or a duration.
