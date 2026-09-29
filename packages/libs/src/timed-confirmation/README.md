# Timed confirmation

[Library index](../../README.md#usage)

## Behavior

[`TimedConfirmation`](index.ts) confirms two identical (`===`) targets before a deadline.

## Caller responsibilities

Supply duration, clock, expiry callback, and local action/messages. Cancel on selection, collection, or mount changes; `dispose()` on closure.
