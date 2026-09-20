# Scrollable text preview

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/text-preview`](index.ts) exports `ScrollableTextPreview` and `renderOverflowBorder`.

`ScrollableTextPreview` caches text/width layout, exposes loading, and calls `changed` on completion; stale/disposed work cannot publish. Rendering slices the viewport, clamps scroll, and reports hidden rows through `overflow`. Text changes reset scroll; color-free layout needs no reflow on `invalidate()`.

## Caller responsibilities

Supply terminal-safe text, for example from [`displayText`](../../terminal-text/index.ts), and retain exact source separately. Handle navigation keys and other view actions. Choose the scroll position, available height, margins, timestamps, and loading messages.

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
