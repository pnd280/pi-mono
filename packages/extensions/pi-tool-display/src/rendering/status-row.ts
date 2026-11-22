import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { wrapHangingRows, wrapRows } from "@pi-mono/libs/tui/text-budget";

/** Continuation rows start beneath the label, after the `• ` marker. */
const LABEL_INDENT = 2;
/** The indent, then the two-column tree connector. */
const CONTINUATION_PREFIX = LABEL_INDENT + 2;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Widest grapheme column width in `text`, so continuation lines never drop wide clusters. */
function maxGraphemeWidth(text: string): number {
  let widest = 1;
  for (const { segment } of segmenter.segment(text))
    widest = Math.max(widest, visibleWidth(segment));

  return widest;
}

/** Compact status message renderer (`• <label> <text>`). Invalid details return `undefined` to keep Pi's default message box. */
export function createStatusRowRenderer(
  label: string,
  format: (details: unknown) => string | undefined
): MessageRenderer {
  return (message, _options, theme) => {
    const text = format(message.details);
    if (text === undefined) return undefined;
    const row = `${theme.fg("accent", TUI_GLYPHS.bullet)} ${theme.fg("accent", theme.bold(label))} ${theme.fg("dim", text)}`;
    const minContinuationWidth = Math.max(maxGraphemeWidth(label), maxGraphemeWidth(text));

    return {
      render(width) {
        // Fall back to full-width wrapping when the prefix leaves too little room for the row's widest grapheme.
        if (width < CONTINUATION_PREFIX + minContinuationWidth) return wrapRows(row, width);
        const [first, ...wrapped] = wrapHangingRows(row, width, width - CONTINUATION_PREFIX);
        if (first === undefined) return [];

        return [
          first,
          ...renderTreeContinuation(wrapped, {
            width,
            indent: LABEL_INDENT,
            style: (line) => theme.fg("dim", line)
          })
        ];
      },
      invalidate() {}
    };
  };
}
