import {
  Markdown,
  sliceByColumn,
  truncateToWidth,
  type Component,
  type Container
} from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

/** Keep native Markdown and its transformers while replacing outer prose padding. */
export function markAssistantProse(container: Container, padding: number): void {
  container.children = container.children.map((child): Component => {
    // Thinking Markdown is nested in a MouseRegion; diagnostics are Text.
    if (!(child instanceof Markdown)) return child;

    let cached: { width: number; source: string[]; rows: string[] } | undefined;

    return {
      invalidate() {
        cached = undefined;
        child.invalidate();
      },
      render(width) {
        const contentWidth = Math.max(1, width - 2);
        const source = child.render(contentWidth + padding * 2);
        if (cached?.width === width && cached.source === source) return cached.rows;

        const rows = source.map((row, index) => {
          const prefix = index === 0 ? `${TUI_GLYPHS.bullet} ` : "  ";

          return truncateToWidth(
            `${prefix}${sliceByColumn(row, padding, contentWidth)}`,
            width,
            ""
          );
        });
        cached = { width, source, rows };

        return rows;
      }
    };
  });
}
