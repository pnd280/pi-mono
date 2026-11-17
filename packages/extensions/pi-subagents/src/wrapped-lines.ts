import { wrapRows } from "@pi-mono/libs/tui/text-budget";

/** Plain lines, wrapped once per width; an empty line stays one empty row. Theme colours stay out of this cache. */
export class Wrapped {
  private cache: { width: number; rows: string[] } | undefined;

  constructor(private lines: readonly string[]) {}

  rows(width: number): string[] {
    if (this.cache?.width !== width)
      this.cache = {
        width,
        rows: this.lines.flatMap((line) => (line ? wrapRows(line, width) : [""]))
      };

    return this.cache.rows;
  }
}
