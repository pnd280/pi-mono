# Scrollable text preview

[Shared TUI](../../README.md#usage)

## Behavior

[`@pi-mono/libs/tui/components/text-preview`](index.ts) exports `ScrollableTextPreview` and `renderOverflowBorder`.

`ScrollableTextPreview` caches the layout for its current text and width. It exposes loading state and requests a redraw through `changed` when the current layout completes. Stale or disposed work cannot publish a result.

The preview slices rows to the requested viewport, clamps the scroll offset during rendering, and reports hidden rows through `overflow`. Changing the text resets the offset. Layout adds no theme colors, so `invalidate()` does not force reflow.

`renderOverflowBorder` renders width-bounded overflow labels and Pi borders. The caller supplies the direction, hidden-row count, optional prefix, and color function.

## Caller responsibilities

Supply terminal-safe text, for example from [`displayText`](../../terminal-text/index.ts), and retain exact source separately. Handle navigation keys and other view actions. Choose the scroll position, available height, margins, timestamps, and loading messages.

Use one preview instance per logical view. Its `current` callback must return `false` when that view closes, not when a host remount hides it. Call `preview.dispose()` at final closure, not during host remounts. Host remounts belong to [responsive custom UI](../../responsive-custom-ui/README.md).

## Usage

Create the preview once for the logical view:

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
