# Scrollable text preview

[Shared TUI](../../README.md#usage)

## Behaviour

Long output needs a scrollable viewport that stays consistent while async layout completes. [`ScrollableTextPreview`](index.ts) caches a text viewport. `renderOverflowBorder` draws caller-owned overflow labels.

The preview calls `changed` when current work completes. A text change resets the scroll. Stale or disposed work cannot publish.

The preview prepares rows with `layoutPreview`, which is also exported for callers that need cooperative wrapping without a viewport, such as interaction measurements:

- `layoutPreview(text, width, current)` returns the same rows as Pi's `wrapTextWithAnsi(text, Math.max(1, width))`.
- It yields between complete-line batches and checks `current` at each yield.
- Cancellation returns `[]`, never partial rows.
- Pi wraps each logical line synchronously, so one very long line cannot be interrupted and can block the event loop.

## Caller responsibilities

- Supply terminal-safe text, for example from [`displayText`](../../terminal-text/index.ts), and retain exact source separately.
- Handle navigation keys, viewport dimensions, and loading presentation.
- Use one instance per logical view.
- Make `current` return false and call `dispose()` only at final closure, not on [responsive remounts](../../responsive-custom-ui/README.md).
- If you call `layoutPreview` directly, own source retention, layout caching, stale-result suppression, scroll offsets, and disposal.

Related: [text budget](../../text-budget/README.md) owns row budgets and synchronous excerpts.

## Usage

```ts
import { ScrollableTextPreview } from "@pi-mono/libs/tui/components/text-preview";

const preview = new ScrollableTextPreview({
  changed: requestRender,
  current: () => !signal.aborted
});
```

On each draw, set the viewport before rendering. Read `scroll` and `overflow` after rendering clamps the offset:

```ts
preview.setText(displaySafeText);
preview.setViewport({ height: availableRows, scroll: requestedRow });
const lines = preview.render(width);
const scroll = preview.scroll;
const { above, below } = preview.overflow;
```

Show a placeholder while `preview.loading` is true.

## Validation

Use the [package validation commands](../../../../README.md#validation).
