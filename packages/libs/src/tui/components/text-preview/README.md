# Scrollable text preview

[Shared TUI](../../README.md#usage)

## Behavior

[`ScrollableTextPreview`](index.ts) caches a text viewport; `renderOverflowBorder` draws caller-owned overflow labels.

The preview calls `changed` when current work completes. Text changes reset scroll; stale/disposed work cannot publish.

## Caller responsibilities

Supply terminal-safe text, for example from [`displayText`](../../terminal-text/index.ts), and retain exact source separately. Handle navigation keys, viewport dimensions, and loading presentation.

Use one instance per logical view; `current` becomes false and `dispose()` runs only at final closure, never [responsive remounts](../../responsive-custom-ui/README.md).

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

Show a placeholder while `preview.loading` is true. For cooperative wrapping without a viewport, use [text layout](../../text-layout/README.md).

## Validation

Use the [package validation commands](../../../../README.md#validation).
