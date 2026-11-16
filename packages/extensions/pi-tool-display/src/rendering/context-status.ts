import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { wrapHangingRows } from "@pi-mono/libs/tui/text-budget";

import { contextStatusText } from "../adapters/pi-smart-compact/index.ts";

/** `pi-smart-compact.context-usage` messages show one usage row. Invalid details keep Pi's default message box. */
export const renderContextStatus: MessageRenderer = (message, _options, theme) => {
  const usage = contextStatusText(message.details);
  if (!usage) return undefined;
  const row = `${theme.fg("accent", TUI_GLYPHS.bullet)} ${theme.fg("accent", theme.bold("Context usage"))} ${theme.fg("dim", usage)}`;

  return {
    render(width) {
      if (width < 1) return [];
      const [first = "", ...wrapped] = wrapHangingRows(row, width, Math.max(1, width - 4));

      return [
        first,
        ...renderTreeContinuation(wrapped, {
          width,
          indent: 2,
          style: (text) => theme.fg("dim", text)
        })
      ];
    },
    invalidate() {}
  };
};
