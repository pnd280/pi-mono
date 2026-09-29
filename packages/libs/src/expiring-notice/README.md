# Expiring notice

[Library index](../../README.md#usage)

## Behavior

[`ExpiringNotice`](index.ts) manages replaceable timed feedback. Clearing or replacing a notice cancels its expiry; disposal also prevents later updates.

## Caller responsibilities

Supply a notice value, duration, and redraw callback; `dispose()` on closure.
