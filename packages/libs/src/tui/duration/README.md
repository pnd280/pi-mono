# Durations

[Shared TUI](../README.md#usage)

Elapsed times must read the same in every extension and never overstate how long work took. [`formatDuration`](index.ts) formats a measured duration in milliseconds.

## Behaviour

- Below one second, it shows milliseconds, such as `450ms`.
- Below one minute, it shows tenths of a second, such as `5.3s`.
- Longer durations show `1m 5s` and `1h 2m 5s`.
- Values round down, so a duration never shows more time than it took.

## Usage

```ts
import { formatDuration } from "@pi-mono/libs/tui/duration";

formatDuration(5349); // "5.3s"
formatDuration(65_300); // "1m 5s"
```

## Caller responsibilities

- Choose when a duration applies. A running timer that ticks once a second passes whole seconds.
- Add glyphs, labels, and separators locally.
- Apply theme styling at render time.
