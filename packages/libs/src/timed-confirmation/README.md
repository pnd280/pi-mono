# Timed confirmation

[Library index](../../README.md#usage)

## Behavior

[`TimedConfirmation`](index.ts) (`@pi-mono/libs/timed-confirmation`): `confirm(target)` succeeds only for two `===` targets before the deadline.

## Caller responsibilities

Supply duration, clock, expiry callback, and local action/messages. Cancel on selection, collection, or mount changes; `dispose()` on closure.

## Validation

Use the [package validation commands](../../README.md#validation).
