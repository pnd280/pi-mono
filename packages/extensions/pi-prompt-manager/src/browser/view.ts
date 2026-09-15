import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  SelectList,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type TUI
} from "@earendil-works/pi-tui";
import { displayText } from "@pi-mono/utils/terminal-text";

import type { BrowserController } from "./controller.ts";
import { actionFor, fixedHints, usableCancelKeys, type BrowserKeys } from "./controls.ts";
import { browserLayout } from "./layout.ts";
import { absoluteTime, layoutPreview, relativeTime } from "./preview.ts";

type ViewTui = Pick<TUI, "requestRender"> & { terminal: Pick<TUI["terminal"], "rows"> };

function keyLabel(key: string): string {
  return key
    .split("+")
    .map((part) => {
      if (part === "escape") return "Esc";
      if (part === "delete") return "Del";

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("+");
}

export class BrowserView implements Component, Focusable {
  private readonly input = new Input();
  private readonly border: DynamicBorder;
  private width = 0;
  private height = 0;
  private layout: { display: string; width: number; lines: string[] | undefined } | undefined;
  private pageSize = 5;

  constructor(
    private readonly controller: BrowserController,
    private readonly tui: ViewTui,
    private readonly theme: Pick<Theme, "fg" | "bold">,
    private readonly keys: BrowserKeys
  ) {
    this.border = new DynamicBorder((text: string) => theme.fg("border", text));
  }

  get focused() {
    return this.input.focused;
  }
  set focused(value: boolean) {
    this.input.focused = value;
  }

  invalidate(): void {
    this.input.invalidate();
    this.controller.cancelConfirmation();
  }

  handleInput(data: string): void {
    const action = actionFor(data, this.keys);

    if (action === "ignore") return;

    if (this.width < 40 || this.height < 10) {
      if (action === "cancel") this.controller.close();

      return;
    }

    this.controller.action(action, this.pageSize);

    if (
      action === "search" &&
      !this.controller.closed &&
      !this.controller.deleting &&
      !this.controller.preview &&
      this.controller.inspectionIndex === undefined
    ) {
      this.input.handleInput(data);
      const query = displayText(this.input.getValue()).replace(/\s+/gu, " ");
      if (query !== this.input.getValue()) this.input.setValue(query);
      if (query !== this.controller.query) this.controller.setQuery(query);
    }

    this.tui.requestRender();
  }

  private previewLines(width: number): string[] | undefined {
    const display = this.controller.selected?.display;

    if (display === undefined) return [];
    if (this.layout?.display === display && this.layout.width === width) return this.layout.lines;
    const layout = { display, width, lines: undefined as string[] | undefined };
    this.layout = layout;
    void layoutPreview(
      display,
      width,
      () => !this.controller.closed && this.layout === layout
    ).then((lines) => {
      if (this.controller.closed || this.layout !== layout) return;
      layout.lines = lines;
      this.tui.requestRender();
    });

    return undefined;
  }

  private footer(width: number, compact: boolean): string[] {
    const state = this.controller;

    const key = (id: Parameters<BrowserKeys["getKeys"]>[0]) => {
      const binding = this.keys.getKeys(id)[0];

      return binding ? keyLabel(binding) : "(unbound)";
    };

    const close = keyLabel(usableCancelKeys(this.keys)[0]!);
    const inspection = state.inspectionIndex !== undefined;
    const primary = [
      `${key("tui.select.confirm")} ${inspection ? "close" : "restore"}`,
      `${key("tui.input.copy")} copy`,
      `${close} ${state.preview && !inspection ? "back" : "close"}`
    ];

    if (!compact) {
      const up = key("tui.select.up");
      const down = key("tui.select.down");
      primary.unshift(
        `${up === "Up" && down === "Down" ? "↑↓" : `${up}/${down}`} ${state.preview ? "scroll" : "navigate"}`
      );
      if (!state.preview && !inspection) primary.unshift("Type to search");
    }

    const lines: string[] = [];
    const padding = compact ? "" : "  ";

    let line = "";

    for (const hint of [...primary, ...this.secondaryHints(compact)]) {
      const joined = line ? `${line} · ${hint}` : hint;
      if (line && visibleWidth(joined) > width - padding.length) {
        lines.push(padding + line);
        line = hint;
      } else line = joined;
    }

    if (line) lines.push(padding + line);

    return lines.map((line) => this.theme.fg("dim", displayText(line)));
  }

  private switchKey(): string | undefined {
    const state = this.controller;
    if (state.inspectionIndex !== undefined) return undefined;
    const fixed = new Set(fixedHints(this.keys, state.collection === "drafts"));

    return fixed.has("tab switch")
      ? "Tab"
      : fixed.has("shift+tab switch")
        ? "Shift+Tab"
        : undefined;
  }

  private switchHint(): string[] {
    const key = this.switchKey();

    return key
      ? [this.theme.fg("dim", key) + this.theme.fg("muted", " view (history/drafts)")]
      : [];
  }

  private secondaryHints(compact: boolean): string[] {
    const state = this.controller;
    if (state.inspectionIndex !== undefined) return [];
    const fixed = new Set(fixedHints(this.keys, state.collection === "drafts"));
    const hints: string[] = [];
    const switching = this.switchKey();
    if (compact && switching) hints.push(`${switching} view`);
    if (!state.preview && fixed.has("ctrl+p preview")) hints.push("Ctrl+P preview");
    if (fixed.has("delete delete")) hints.push("Del×2 remove");
    if (fixed.has("alt+enter restore-remove")) hints.push("Alt+Enter restore/remove");

    return hints;
  }

  private heading(compact: boolean, status: string | undefined): string {
    const state = this.controller;
    if (compact && status)
      return this.theme.fg(state.armed ? "warning" : "accent", ` ${displayText(status)} `);

    if (state.inspectionIndex !== undefined) {
      const title = `Draft ${state.inspectionIndex} · Inspection`;

      return compact
        ? this.theme.fg("accent", ` ${title} `)
        : `  ${this.theme.bold(this.theme.fg("accent", title))}`;
    }

    // Match /model's scope row: accent for the active choice, muted labels and separator otherwise.
    const tabs = ["history", "drafts"]
      .map((collection) =>
        this.theme.fg(state.collection === collection ? "accent" : "muted", collection)
      )
      .join(this.theme.fg("muted", " | "));

    return compact ? ` ${tabs} ` : this.theme.fg("muted", "View: ") + tabs;
  }

  private overflowBorder(
    width: number,
    { direction, hidden, prefix = "" }: { direction: "↑" | "↓"; hidden: number; prefix?: string }
  ): string {
    // Match Pi Editor's border labels; its createScrollBorder helper is not exported.
    const label = hidden > 0 ? ` ${direction} ${hidden} more ` : "";
    const labelWidth = visibleWidth(label);
    const heading = truncateToWidth(prefix, width - labelWidth - 2);
    const headingWidth = visibleWidth(heading);
    if (!label) return heading + this.border.render(width - headingWidth)[0];

    // Center when possible, but keep compact titles/status and both border ends visible.
    const leftWidth = Math.max(headingWidth + 1, Math.floor((width - labelWidth) / 2));

    return (
      heading +
      this.border.render(leftWidth - headingWidth)[0] +
      this.theme.fg("border", label) +
      this.border.render(width - leftWidth - labelWidth)[0]
    );
  }

  render(width: number): string[] {
    const height = this.tui.terminal.rows;

    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.controller.cancelConfirmation();
    }

    const contentHeight = browserLayout(height).height;
    const crop = (line: string) => truncateToWidth(line, Math.max(1, width));
    if (width < 40 || height < 10)
      return [
        crop("Resize to at least 40 columns × 10 rows."),
        crop(`${usableCancelKeys(this.keys).map(keyLabel).join("/")} close`)
      ].slice(0, contentHeight);

    // Shrink optional settings-style spacing before content or controls within the height cap.
    const compact = contentHeight < 15 || width < 60;
    const state = this.controller;
    const status = this.statusText();
    const heading = this.heading(compact, status);
    // Fill the top border after rendering clamps the visible preview window.
    const lines = compact ? [""] : ["", heading, ...this.switchHint()];
    const footer = this.footer(width, compact);

    if (!state.preview && state.inspectionIndex === undefined) {
      if (this.input.getValue() !== state.query) this.input.setValue(state.query);
      const inputLines = this.input.render(width);
      lines.push(...(compact ? inputLines : ["", ...inputLines, ""]));
    }

    if (!compact && status)
      lines.push(this.theme.fg(state.armed ? "warning" : "dim", `  ${displayText(status)}`));

    // Keep cancellation visible even with unusually long rebound shortcuts.
    const footerRows = Math.min(footer.length, contentHeight - lines.length - 2);
    const available = Math.max(
      1,
      contentHeight - lines.length - footerRows - 1 - (compact ? 0 : 1)
    );
    const { above = 0, below = 0 } = this.renderContent(lines, width, available) ?? {};
    lines[0] = this.overflowBorder(width, {
      direction: "↑",
      hidden: above,
      prefix: compact ? heading : ""
    });
    if (!compact) lines.push("");

    return [
      ...lines,
      ...footer.slice(0, footerRows),
      this.overflowBorder(width, { direction: "↓", hidden: below })
    ].map(crop);
  }

  private renderContent(lines: string[], width: number, available: number) {
    const state = this.controller;
    if (state.status === "loading") lines.push(this.theme.fg("dim", "  Loading collection…"));
    else if (state.status === "unavailable")
      lines.push(
        ...wrapTextWithAnsi(`Unavailable: ${displayText(state.error)}`, width - 4)
          .slice(0, available)
          .map((line) => this.theme.fg("error", `  ${line}`))
      );
    else if (state.preview && state.selected) return this.renderPreview(lines, width, available);
    else this.renderResults(lines, width, available);
  }

  private statusText(): string | undefined {
    const state = this.controller;

    return state.deleting
      ? "Removing occurrence…"
      : state.armed
        ? "Delete again to remove (1.5s)"
        : state.searching
          ? "Searching…"
          : state.snapshot?.access === "read-only"
            ? "Read-only: repair invalid occurrence IDs."
            : state.snapshot?.access === "delete-only"
              ? "Recovery: deletions only."
              : state.snapshot?.warnings[0];
  }

  private renderPreview(lines: string[], width: number, available: number) {
    const state = this.controller;
    const preview = this.previewLines(width - 4);
    this.pageSize = Math.max(1, available - 2);
    if (available > 1) lines.push(this.theme.fg("dim", `  ${absoluteTime(state.selected?.time)}`));
    if (available > 2) lines.push("");

    if (!preview) {
      lines.push(this.theme.fg("dim", "  Preparing full preview…"));

      return;
    }

    state.previewScroll = Math.min(
      state.previewScroll,
      Math.max(0, preview.length - this.pageSize)
    );
    const visible = preview.slice(state.previewScroll, state.previewScroll + this.pageSize);
    lines.push(...visible.map((line) => `  ${line}`));

    return {
      above: state.previewScroll,
      below: preview.length - state.previewScroll - visible.length
    };
  }

  private resultWindow(available: number, selectedIndex: number) {
    const results = this.controller.results;
    const rows = Math.min(10, Math.max(1, available - (results.length > available ? 1 : 0)));
    const start = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(rows / 2), results.length - rows)
    );

    return { rows, start, items: results.slice(start, start + rows) };
  }

  private renderResults(lines: string[], width: number, available: number) {
    const state = this.controller;

    if (!state.results.length) {
      lines.push(
        this.theme.fg(
          "dim",
          (state.snapshot?.entries.length ?? 0) > 0
            ? "  No search matches."
            : "  Collection is empty."
        )
      );

      return;
    }

    const now = Date.now();
    const selectedIndex = state.selectedIndex;
    const { items, start, rows: resultRows } = this.resultWindow(available, selectedIndex);
    const ageWidth = Math.max(3, ...items.map((item) => relativeTime(item.time, now).length));
    this.pageSize = resultRows;

    // Keep selection controller-owned and rebuild only the visible rows so ages stay current.
    // Use one native primary column to retain both age and prompt even at 40 columns.
    const list = new SelectList(
      items.map((item) => ({
        value: item.occurrence.key,
        label: `${relativeTime(item.time, now).padEnd(ageWidth)}  ${item.summary}`
      })),
      resultRows,
      {
        selectedPrefix: (text) => this.theme.fg("accent", text),
        selectedText: (text) => this.theme.fg("accent", text),
        description: (text) => this.theme.fg("muted", text),
        scrollInfo: (text) => this.theme.fg("dim", text),
        noMatch: (text) => this.theme.fg("dim", text)
      },
      {
        truncatePrimary: ({ text, maxWidth, isSelected }) => {
          const label = truncateToWidth(text, maxWidth);

          return isSelected
            ? label
            : this.theme.fg("muted", label.slice(0, ageWidth)) + label.slice(ageWidth);
        }
      }
    );

    list.setSelectedIndex(selectedIndex - start);
    const rows = list.render(width);
    if (state.results.length > resultRows)
      rows.push(this.theme.fg("dim", `  (${selectedIndex + 1}/${state.results.length})`));
    // At minimum height the selected row takes precedence over the optional position indicator.
    lines.push(...rows.slice(0, available));
  }
}
