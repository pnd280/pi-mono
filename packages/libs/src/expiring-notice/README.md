# Expiring notice

[Library index](../../README.md#usage)

Show feedback that clears itself on a timer and never updates after disposal.

## Behaviour

[`ExpiringNotice`](index.ts) manages replaceable timed feedback. Clearing or replacing a notice cancels its expiry. Disposal also prevents later updates.

## Caller responsibilities

Supply a notice value, duration, and redraw callback; `dispose()` on closure.
