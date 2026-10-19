# Background results

[pi-subagents](../README.md) · [Glossary](../GLOSSARY.md)

A [background result](../GLOSSARY.md#results) delivers a finished background task or [job](jobs.md) to its supervisor. This guide explains when the result reaches the model, how long a supervisor waits for it, and how its usage is counted. The decisions are in [ADR 0001](adr/0001-hold-run-for-background-results.md) and [ADR 0006](adr/0006-deliver-background-results-at-turn-end.md).

## Delivery timing

The [`resultDelivery`](../README.md#configuration) setting chooses when a ready result reaches a busy supervisor:

| Value                | When a ready result joins the run                                          |
| -------------------- | -------------------------------------------------------------------------- |
| `turn_end` (default) | After the model's reply and its tool calls, before the next model request. |
| `settle`             | After the model's final reply.                                             |

Delivery at the end of a turn skips failed, aborted, and length-truncated replies, so that Pi can retry or recover first.

With `resultDelivery` set to `turn_end`, a result is part of more model requests than with `settle`. A large result, such as a 50 KiB job tail, then uses more input tokens and can make compaction start earlier.

## Waiting for background tasks

In all modes, a supervisor stays busy after a normal reply while its direct background tasks run. Each time a task finishes, its result continues the same run before the supervisor waits for the next task.

- New input or an abort ends the wait after a normal reply. The tasks continue, and a later result starts a new turn when the supervisor is idle.
- A child consumes the results of its background descendants before returning.
- Print and JSON supervisors wait before exiting.
- The waiting time counts as busy time, for example in `pi-agent-summary`, and commands that need an idle session are blocked until the wait ends.

In TUI mode, the `pi-subagents.waiting` component adds “Waiting for background subagents” to the [shared working message](../../../libs/src/working-message/README.md) during the wait; `/working-message` orders it.

Edge cases:

- A reply that fails and that Pi retries does not wait.
- If Pi does not recover an error or length-truncated reply, children and print or JSON supervisors still wait for background results. An abort cannot interrupt this wait.

Supervisors do not wait for jobs; see [job results](jobs.md#job-results).

## Usage accounting

Usage until the tool call returns contributes through the tool result. When a background result is delivered, the later usage is added to supervisor totals as a hidden Pi `usage` entry attributed to the child's last reported model; the result's details show the full run usage. This is [late usage](../GLOSSARY.md#results), described in [ADR 0002](adr/0002-count-late-background-usage.md).

- Usage after the call returns is not counted if its result is never delivered, such as a cancellation after `subagent_abort` or a result pending at shutdown.
- If a stopped child cannot report usage, that call reports none.
