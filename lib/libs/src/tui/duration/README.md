# Durations

[Shared TUI](../README.md#usage)

## Behaviour

[`formatDuration`](index.ts) formats a measured duration in milliseconds: `450ms` below one second, tenths of a second below one minute, such as `5.3s`, then `1m 5s` and `1h 2m 5s`. Values round down, so a duration never shows more time than it took.

## Caller responsibilities

- Choose when a duration applies. A running timer that ticks once a second passes whole seconds.
- Add glyphs, labels, and separators locally.
- Apply theme styling at render time.
