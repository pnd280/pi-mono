# Expiring notice

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/expiring-notice`](index.ts) exports `ExpiringNotice` for replaceable timed feedback.

`reportOnce()` reports at most once per notice in a microtask, avoiding component-tree changes during rendering. Clearing, replacing, or disposing suppresses queued reports.

## Caller responsibilities

Supply notice text/value, duration, redraw, and reporting. Detect overflow yourself and call `reportOnce()`; `dispose()` on closure.

## Validation

Use the [package validation commands](../../README.md#validation).
