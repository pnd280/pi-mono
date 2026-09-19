# Latest task

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/latest-task`](index.ts) exports `LatestTask`. Only the current task can commit a result, propagate an error, or clear pending state.

Cancellation and disposal invalidate the current task without aborting its underlying work.

## Caller responsibilities

Supply the work, result commit, and `changed` callback. Pass the work's `current` callback to cooperative operations such as [text search](../text-search/README.md). Handle errors from the current task in the consumer.

Call `cancel()` when results are no longer relevant and `dispose()` when the owner closes. The consumer controls any I/O cancellation beyond the `current` checks.

## Validation

Use the [package validation commands](../../README.md#validation).
