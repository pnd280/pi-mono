# Token counts

[Shared TUI](../README.md#usage)

## Behaviour

Token counts must use the same scale as Pi's footer. [`formatTokenCount`](index.ts) gives `999`, `1.2k`, `12k`, `1.2M`, and `12M`.

## Caller responsibilities

- Add prefixes such as `↑` or `R`, and the cost, locally.
- Apply theme styling at render time.
