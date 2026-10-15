# Latest task

[Library index](../../README.md#usage)

Discard results from obsolete work when only the newest task may commit.

## Behaviour

[`@pi-mono/libs/latest-task`](index.ts) exports `LatestTask`. Only the current task can commit a result, propagate an error, or clear pending state.

Cancellation and disposal invalidate the current task without aborting its underlying work.

## Caller responsibilities

- Supply work, commit, and `changed` callbacks, and handle current-task errors.
- Pass `current` to cooperative operations such as [text search](../text-search/README.md).
- Call `cancel()` when results become obsolete, and `dispose()` on closure.
- Abort I/O separately.
