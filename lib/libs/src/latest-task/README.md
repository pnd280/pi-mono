# Latest task

[Collection browser](../tui/components/browser/README.md)

Discard results from obsolete work when only the newest task may commit. This internal module has no package export; the [browser controller](../tui/components/browser/controller.ts) uses it for section searches.

## Behaviour

[`LatestTask`](index.ts) lets only the current task commit a result, propagate an error, or clear pending state.

Cancellation and disposal invalidate the current task without aborting its underlying work.

## Caller responsibilities

- Supply work, commit, and `changed` callbacks, and handle current-task errors.
- Pass `current` to cooperative operations, such as a [browser](../tui/components/browser/README.md#sections-and-items) `search` callback.
- Call `cancel()` when results become obsolete, and `dispose()` on closure.
- Abort I/O separately.
