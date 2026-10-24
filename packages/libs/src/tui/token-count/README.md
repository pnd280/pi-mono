# Token counts

[Shared TUI](../README.md#usage)

Token counts must use the same scale as Pi's footer. [`formatTokenCount`](index.ts) gives `999`, `1.2k`, `12k`, `1.2M`, and `12M`.

## Usage

```ts
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";

formatTokenCount(1234); // "1.2k"
```

## Caller responsibilities

- Add prefixes such as `↑` or `R`, and the cost, locally.
- Apply theme styling at render time.
