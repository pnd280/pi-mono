import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import { layoutPreview } from "../../text-layout/index.ts";

/** A controlled viewport: consumers supply display-safe text and interpret navigation keys. */
export class ScrollableTextPreview implements Component {
  private text = "";
  private height = 1;
  private offset = 0;
  private disposed = false;
  private layout: { width: number; lines: string[] | undefined } | undefined;

  constructor(private readonly options: { changed(): void; current(): boolean }) {}

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.layout = undefined;
    this.offset = 0;
  }

  setViewport({ height, scroll }: { height: number; scroll: number }): void {
    this.height = Math.max(0, Math.floor(height));
    this.offset = Math.max(0, Math.floor(scroll));
  }

  get loading(): boolean {
    return this.layout?.lines === undefined;
  }

  get scroll(): number {
    return this.offset;
  }

  get overflow(): { above: number; below: number } {
    const lines = this.layout?.lines;

    return lines === undefined
      ? { above: 0, below: 0 }
      : { above: this.offset, below: Math.max(0, lines.length - this.offset - this.height) };
  }

  render(width: number): string[] {
    if (this.disposed || !this.options.current()) return [];
    width = Math.max(0, Math.floor(width));
    if (!width || !this.height) return [];
    if (this.layout?.width !== width) this.prepare(width);
    const lines = this.layout?.lines;
    if (lines === undefined) return [];
    this.offset = Math.min(this.offset, Math.max(0, lines.length - this.height));

    return lines
      .slice(this.offset, this.offset + this.height)
      .map((line) => truncateToWidth(line, width));
  }

  private prepare(width: number): void {
    const layout = { width, lines: undefined as string[] | undefined };
    this.layout = layout;
    const current = () => !this.disposed && this.options.current() && this.layout === layout;
    void layoutPreview(this.text, width, current).then((lines) => {
      if (!current()) return;
      layout.lines = lines;
      this.options.changed();
    });
  }

  invalidate(): void {
    // Layout contains no theme colors. Width and text changes invalidate it separately.
  }

  dispose(): void {
    this.disposed = true;
    this.layout = undefined;
  }
}

/** Pi-style overflow labels with optional consumer-owned heading/status text. */
export function renderOverflowBorder(
  width: number,
  {
    direction,
    hidden,
    prefix = "",
    color
  }: {
    direction: "↑" | "↓";
    hidden: number;
    prefix?: string;
    color(this: void, text: string): string;
  }
): string {
  width = Math.max(0, Math.floor(width));
  if (!width) return "";
  const border = new DynamicBorder((text: string) => color(text));
  // Pi Editor's createScrollBorder helper is not exported.
  const label = hidden > 0 ? ` ${direction} ${hidden} more ` : "";
  const labelWidth = visibleWidth(label);
  if (labelWidth + 2 > width) return truncateToWidth(color(label), width);
  const heading = truncateToWidth(prefix, Math.max(0, width - labelWidth - 2));
  const headingWidth = visibleWidth(heading);
  if (!label) return heading + border.render(width - headingWidth)[0];
  const leftWidth = Math.max(headingWidth + 1, Math.floor((width - labelWidth) / 2));

  return (
    heading +
    border.render(leftWidth - headingWidth)[0] +
    color(label) +
    border.render(width - leftWidth - labelWidth)[0]
  );
}
