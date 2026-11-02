# Durations

[Shared TUI](../README.md#usage)

Elapsed times must read the same in every extension and never overstate how long work took. [`formatDuration`](index.ts) formats a measured duration in milliseconds, and `formatRunningDuration` formats a live timer that ticks once a second.

## Behaviour

- Below one second, `formatDuration` shows milliseconds, such as `450ms`.
- Below one minute, it shows tenths of a second, such as `5.3s`.
- Longer durations show `1m 5s` and `1h 2m 5s`.
- `formatRunningDuration` shows whole seconds, such as `0s`, `5s`, and `1m 5s`, and shows `0s` for a negative duration.
- Values round down, so a duration never shows more time than it took.

## Usage

```ts
import { formatDuration, formatRunningDuration } from "@pi-mono/libs/tui/duration";

formatDuration(5349); // "5.3s"
formatDuration(65_300); // "1m 5s"
formatRunningDuration(5349); // "5s"
```

## Caller responsibilities

- Choose when a duration applies: `formatDuration` for a measured duration, and `formatRunningDuration` for a timer that is still running.
- Add glyphs, labels, and separators locally.
- Apply theme styling at render time.
