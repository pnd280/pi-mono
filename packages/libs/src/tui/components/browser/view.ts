import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Input,
  truncateToWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
  type TUI
} from "@earendil-works/pi-tui";

import { displayText } from "../../terminal-text/index.ts";
import { renderHintFooter } from "../hint-footer/index.ts";
import { renderOverflowBorder, ScrollableTextPreview } from "../text-preview/index.ts";
import { renderWindowedList } from "../windowed-list/index.ts";
import { BrowserController } from "./controller.ts";
import { BrowserControls, type BrowserKeys } from "./controls.ts";
import { browserLayout } from "./layout.ts";
import type { BrowserOptions } from "./types.ts";

type BrowserEnvironment = {
  tui: Pick<TUI, "requestRender"> & { terminal: Pick<TUI["terminal"], "rows"> };
  theme: Pick<Theme, "fg" | "bold">;
  keys: BrowserKeys;
  close(this: void): void;
  onError(this: void, error: unknown): void;
};

type FooterMessage = { text: string; color: "dim" | "warning" };

export class Browser<Item> implements Component, Focusable {
  readonly controller: BrowserController<Item>;
  private readonly input = new Input();
  private readonly controls: BrowserControls;
  private readonly textPreview: ScrollableTextPreview;
  private width = 0;
  private height = 0;
  private pageSize = 5;

  constructor(
    readonly options: BrowserOptions<Item>,
    private readonly environment: BrowserEnvironment
  ) {
    this.controls = new BrowserControls(environment.keys);
    if (!this.controls.key("cancel"))
      throw (
        options.cancelError ??
        new Error("Browser requires an unshadowed cancel binding other than Ctrl+C.")
      );
    this.controller = new BrowserController(options, {
      changed: () => environment.tui.requestRender(),
      close: environment.close,
      now: Date.now,
      onError: environment.onError
    });
    this.textPreview = new ScrollableTextPreview({
      changed: () => environment.tui.requestRender(),
      current: () => !this.controller.closed
    });
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

  private isClosed() {
    return this.controller.closed;
  }

  handleInput(data: string): void {
    const action = this.controls.actionFor(data);
    if (action === "ignore" || this.controller.closed) return;

    if (this.width < 40 || this.height < 10) {
      if (action === "cancel") this.controller.close();

      return;
    }

    this.controller.action(action, this.pageSize);

    if (
      action === "search" &&
      !this.isClosed() &&
      !this.controller.busy &&
      !this.controller.preview &&
      !this.options.inspection
    ) {
      this.input.handleInput(data);
      const query = displayText(this.input.getValue()).replace(/\s+/gu, " ");
      if (query !== this.input.getValue()) this.input.setValue(query);
      if (query !== this.controller.query) this.controller.setQuery(query);
    }

    this.environment.tui.requestRender();
  }

  dispose(): void {
    this.controller.close();
    this.textPreview.dispose();
  }

  private footer({
    width,
    compact,
    message,
    maxRows
  }: {
    width: number;
    compact: boolean;
    message: FooterMessage | undefined;
    maxRows: number;
  }): string[] {
    const state = this.controller;
    const { theme } = this.environment;
    const inspection = this.options.inspection !== undefined;
    const primary: (string | undefined)[] = [];
    if (inspection || state.section.confirm)
      primary.push(
        this.controls.hint("confirm", inspection ? "close" : state.section.confirm!.label)
      );
    if (state.section.copy) primary.push(this.controls.hint("copy", "copy"));
    primary.push(this.controls.hint("cancel", state.preview && !inspection ? "back" : "close"));

    if (!compact) {
      primary.unshift(...this.controls.navigationHints(state.preview ? "scroll" : "navigate"));
      if (!state.preview && !inspection) primary.unshift("Type to search");
    }

    return renderHintFooter({
      width,
      maxRows,
      hints: [...primary, ...this.secondaryHints(compact)]
        .filter((hint) => hint !== undefined)
        .map(displayText),
      padding: compact ? "" : "  ",
      separator: " · ",
      style: (text) => theme.fg("dim", text),
      ...(message
        ? {
            message: {
              text: displayText(message.text),
              style: (text: string) => theme.fg(message.color, text),
              overflowText: message.text
            }
          }
        : {})
    }).rows;
  }

  private switchKey(): string | undefined {
    if (this.options.inspection || this.options.sections.length < 2) return undefined;

    return this.controls.key("switch");
  }

  private switchHint(): string[] {
    const key = this.switchKey();
    const { theme } = this.environment;
    const labels = this.options.sections.map((section) => displayText(section.label)).join("/");

    return key ? [theme.fg("dim", key) + theme.fg("muted", ` view (${labels})`)] : [];
  }

  private secondaryHints(compact: boolean): (string | undefined)[] {
    const state = this.controller;
    if (this.options.inspection) return [];
    const hints: (string | undefined)[] = [];
    const switching = this.switchKey();
    if (compact && switching) hints.push(`${switching} view`);
    if (!state.preview) hints.push(this.controls.hint("preview", "preview"));
    if (state.section.remove) hints.push(this.controls.hint("delete", state.section.remove.label));
    if (state.section.alternate)
      hints.push(this.controls.hint("alternate", state.section.alternate.label));

    return hints;
  }

  private heading(compact: boolean, status: string | undefined): string {
    const { theme } = this.environment;
    if (compact && status) return theme.fg("accent", ` ${displayText(status)} `);

    if (this.options.inspection) {
      const title = displayText(this.options.inspection.title);

      return compact
        ? theme.fg("accent", ` ${title} `)
        : `  ${theme.bold(theme.fg("accent", title))}`;
    }

    const tabs = this.options.sections
      .map((section) =>
        theme.fg(
          this.controller.section === section ? "accent" : "muted",
          displayText(section.label)
        )
      )
      .join(theme.fg("muted", " | "));

    return compact ? ` ${tabs} ` : theme.fg("muted", "View: ") + tabs;
  }

  render(width: number): string[] {
    if (this.controller.closed) return [];
    const height = this.environment.tui.terminal.rows;

    if (this.width !== width || this.height !== height) {
      this.width = width;
      this.height = height;
      this.controller.cancelConfirmation();
    }

    return this.renderBody(width, height);
  }

  private renderBody(width: number, height: number): string[] {
    const { theme } = this.environment;
    const contentHeight = browserLayout(height).height;
    const crop = (line: string) => truncateToWidth(line, Math.max(0, width));

    if (width < 40 || height < 10) {
      return [
        crop("Resize to at least 40 columns × 10 rows."),
        crop(this.controls.hint("cancel", "close")!)
      ].slice(0, contentHeight);
    }

    const compact = contentHeight < 15 || width < 60;
    const state = this.controller;
    const status = state.snapshot?.message;
    const heading = this.heading(compact, status);
    const message = this.footerMessage();
    const lines = compact
      ? [""]
      : ["", heading, ...this.switchHint().map((hint) => (message ? "" : hint))];

    if (!state.preview && !this.options.inspection) {
      if (this.input.getValue() !== state.query) this.input.setValue(state.query);
      const inputLines = this.input.render(width);
      lines.push(...(compact ? inputLines : ["", ...inputLines, ""]));
    }

    if (!compact && status) lines.push(theme.fg("dim", `  ${displayText(status)}`));
    const footer = this.footer({
      width,
      compact,
      message,
      maxRows: contentHeight - lines.length - 2
    });
    const available = Math.max(
      1,
      contentHeight - lines.length - footer.length - 1 - (compact ? 0 : 1)
    );
    const { above = 0, below = 0 } = this.renderContent(lines, width, available) ?? {};
    const color = (text: string) => theme.fg("border", text);
    lines[0] = renderOverflowBorder(width, {
      color,
      direction: "↑",
      hidden: above,
      prefix: compact ? heading : ""
    });
    if (!compact) lines.push("");

    return [
      ...lines,
      ...footer,
      renderOverflowBorder(width, { color, direction: "↓", hidden: below })
    ].map(crop);
  }

  private renderContent(lines: string[], width: number, available: number) {
    const state = this.controller;
    const { theme } = this.environment;
    if (state.status === "loading") lines.push(theme.fg("dim", "  Loading collection…"));
    else if (state.status === "unavailable")
      lines.push(
        ...wrapTextWithAnsi(`Unavailable: ${displayText(state.error)}`, width - 4)
          .slice(0, available)
          .map((line) => theme.fg("error", `  ${line}`))
      );
    else if (state.preview && state.selected !== undefined)
      return this.renderPreview(lines, width, available);
    else this.renderResults(lines, width, available);
  }

  private footerMessage(): FooterMessage | undefined {
    const state = this.controller;
    if (state.busy) return { text: state.section.remove?.pending ?? "Working…", color: "dim" };
    if (state.armed && state.section.remove)
      return { text: state.section.remove.confirmation, color: "warning" };

    return undefined;
  }

  private renderPreview(lines: string[], width: number, available: number) {
    const state = this.controller;
    const { theme } = this.environment;
    const content = this.options.preview(state.selected!);
    const metadataRows = content.metadata === undefined ? 0 : 2;
    this.pageSize = Math.max(1, available - metadataRows);
    this.textPreview.setText(content.text);
    this.textPreview.setViewport({ height: this.pageSize, scroll: state.previewScroll });
    const preview = this.textPreview.render(width - 4);

    if (content.metadata !== undefined) {
      if (available > 1) lines.push(theme.fg("dim", `  ${displayText(content.metadata)}`));
      if (available > 2) lines.push("");
    }

    if (this.textPreview.loading) {
      lines.push(theme.fg("dim", "  Preparing full preview…"));

      return;
    }

    state.previewScroll = this.textPreview.scroll;
    lines.push(...preview.map((line) => `  ${line}`));

    return this.textPreview.overflow;
  }

  private renderResults(lines: string[], width: number, available: number) {
    const state = this.controller;
    const { theme } = this.environment;

    if (!state.results.length) {
      lines.push(
        theme.fg(
          "dim",
          (state.snapshot?.items.length ?? 0) > 0
            ? "  No search matches."
            : "  Collection is empty."
        )
      );

      return;
    }

    const selectedIndex = state.selectedIndex;
    const resultRows = Math.min(
      10,
      Math.max(1, available - (state.results.length > available ? 1 : 0))
    );
    this.pageSize = resultRows;
    const { lines: rows } = renderWindowedList({
      items: state.results,
      selectedIndex,
      width,
      maxRows: resultRows,
      theme: {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("muted", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("dim", text)
      },
      format: (items) => this.options.format(items, theme)
    });
    if (state.results.length > resultRows)
      rows.push(theme.fg("dim", `  (${selectedIndex + 1}/${state.results.length})`));
    lines.push(...rows.slice(0, available));
  }
}
