# Timed confirmation

[Library index](../../README.md#usage)

Confirm the same target twice before its deadline passes.

## Behaviour

[`TimedConfirmation`](index.ts) confirms two identical (`===`) targets before a deadline.

## Caller responsibilities

Supply duration, clock, expiry callback, and the local action and messages. Cancel on selection, collection, or mount changes. Call `dispose()` on closure.
