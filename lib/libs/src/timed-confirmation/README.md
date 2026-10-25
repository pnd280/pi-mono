# Timed confirmation

[Library index](../../README.md#usage)

Confirm the same target twice before its deadline passes, for example a second key press that confirms an interrupt. [`TimedConfirmation`](index.ts) (`@pi-mono/libs/timed-confirmation`) tracks the armed target and its deadline.

## Behaviour

- `confirm(target)` returns `true` when the same (`===`) target is armed and its deadline has not passed.
- Otherwise it arms the new target and returns `false`.
- Expiry disarms the target and calls `expired`.

## Usage

```ts
import { TimedConfirmation } from "@pi-mono/libs/timed-confirmation";

const pending = new TimedConfirmation<string>({
  durationMs: 1500,
  now: Date.now,
  expired: () => hint.setText()
});

if (pending.confirm("interrupt")) stopRun();
else hint.setText("Press again to stop");
```

## Caller responsibilities

- Supply `durationMs`, a `now` clock, and an `expired` callback. Durations outside 0 through 2,147,483,647 milliseconds throw `RangeError`.
- Own the confirmed action and its messages.
- Cancel on selection, collection, or mount changes.
- Call `dispose()` on closure.

Related: [pi-abort-guard](../../../extensions/pi-abort-guard/README.md) confirms interrupts with this class.
