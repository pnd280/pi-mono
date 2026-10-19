# Timed confirmation

[Library index](../../README.md#usage)

Confirm the same target twice before its deadline passes.

## Behaviour

[`TimedConfirmation`](index.ts) (`@pi-mono/libs/timed-confirmation`) confirms two identical (`===`) targets before a deadline. `confirm(target)` returns `true` when the same target is armed and its deadline has not passed. Otherwise it arms the new target and returns `false`. Expiry disarms the target and calls `expired`.

## Caller responsibilities

Supply `durationMs`, a `now` clock, and an `expired` callback. Durations outside 0 through 2,147,483,647 milliseconds throw `RangeError`. Own the confirmed action and its messages. Cancel on selection, collection, or mount changes. Call `dispose()` on closure.
