import { MouseRegion, truncateToWidth, type Component } from "@earendil-works/pi-tui";

import type { DisplayContext, DisplayBinding } from "./types.ts";

class DisplayComponent implements Component {
  private width: number | undefined;
  private rows: string[] | undefined;
  constructor(
    private project: (width: number) => string[],
    private reset: () => void
  ) {}
  update(project: (width: number) => string[], reset: () => void): void {
    this.project = project;
    this.reset = reset;
    this.invalidate();
  }
  render(width: number): string[] {
    if (width < 1) return [];

    if (this.width !== width || !this.rows) {
      this.width = width;
      this.rows = this.project(width).map((row) => truncateToWidth(row, width, ""));
    }

    return this.rows;
  }
  invalidate(): void {
    this.width = undefined;
    this.rows = undefined;
    this.reset();
  }
}

export function component(
  context: DisplayContext,
  project: (width: number) => string[],
  reset: () => void,
  binding?: DisplayBinding
): Component {
  if (!binding && context.lastComponent instanceof DisplayComponent) {
    context.lastComponent.update(project, reset);

    return context.lastComponent;
  }

  const content = new DisplayComponent(project, reset);

  return binding
    ? new MouseRegion(content, (event) => {
        if (
          event.type !== "click" ||
          event.button !== "left" ||
          !binding.coordinator.group(binding.call)
        )
          return undefined;
        binding.coordinator.expand(binding.call, !binding.call.expanded);

        return { handled: true };
      })
    : content;
}
