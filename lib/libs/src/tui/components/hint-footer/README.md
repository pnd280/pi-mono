# Hint footers

[Shared TUI](../../README.md#usage)

A footer must show available hints and transient feedback in a fixed height. [`renderHintFooter`](index.ts) returns rows fitted to the visible terminal width, up to `maxRows`.

## Behaviour

- Messages replace hints at the same height.
- If a message overflows, `overflowText` replaces the final row.
- A width or row limit of zero returns no rows.
- The footer sends no notifications and starts no timers.

## Usage

```ts
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";

const rows = renderHintFooter({
  width,
  maxRows: 2,
  hints: ["↑↓ select", "Enter open", "Esc close"],
  padding: "  ",
  separator: " · ",
  style: (text) => theme.fg("dim", text),
  ...(feedback
    ? {
        message: {
          text: feedback,
          style: (text) => theme.fg("warning", text),
          overflowText: "… resize for details"
        }
      }
    : {})
});
```

## Caller responsibilities

- Supply display-safe strings, width-preserving styling, and finite nonnegative viewport dimensions.
- Select hints and row limits for the active actions and layout.
- Retain full messages separately from the bounded rows.
- Own feedback expiry and delivery.

Related: the [settings menu](../settings-menu/README.md) renders its hints with this footer.
