# Expiring notice

[Library index](../../README.md#usage)

Show feedback that clears itself on a timer and never updates after disposal.

## Behaviour

[`ExpiringNotice`](index.ts) (`@pi-mono/libs/expiring-notice`) manages replaceable timed feedback. `set(value)` replaces the notice, restarts its expiry, and calls `changed`. Expiry clears the notice and calls `changed`. `clear()` removes the notice and cancels its expiry without calling `changed`. Disposal also prevents later updates.

## Caller responsibilities

Supply `durationMs` and a `changed` redraw callback. Durations outside 0 through 2,147,483,647 milliseconds throw `RangeError`. Redraw after your own `clear()` calls. Call `dispose()` on closure.
