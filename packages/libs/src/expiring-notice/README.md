# Expiring notice

[Library index](../../README.md#usage)

## Behavior

[`ExpiringNotice`](index.ts) manages replaceable timed feedback. `reportOnce()` defers reporting to a microtask to avoid component-tree changes during rendering; clearing, replacing, or disposing suppresses queued reports.

## Caller responsibilities

Supply notice text/value, duration, redraw, and reporting. Detect overflow yourself and call `reportOnce()`; `dispose()` on closure.

## Validation

Use the [package validation commands](../../README.md#validation).
