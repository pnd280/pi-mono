# Expiring notice

[Library index](../../README.md#usage)

## Behavior

[`@pi-mono/libs/expiring-notice`](index.ts) exports `ExpiringNotice` for replaceable timed feedback. Setting a notice replaces the previous value and expiry timer.

`reportOnce()` defers reporting to a microtask and reports at most once per notice. Clearing or replacing the notice, or disposing the instance, suppresses the queued report. Deferral keeps notifications from changing the component tree during rendering.

## Caller responsibilities

Supply the notice value, duration, redraw callback, and report callback. The library does not measure whether feedback fits. Call `reportOnce()` when the consumer detects overflow.

Choose feedback messages and call `dispose()` when the owner closes.

## Validation

Use the [package validation commands](../../README.md#validation).
