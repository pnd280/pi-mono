import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  isKeyRelease,
  Loader,
  matchesKey,
  ScrollView,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";
import { renderOverflowBorder } from "@pi-mono/libs/tui/components/text-preview";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";
import { createTranscriptViewer, type TranscriptViewer } from "pi-tool-display/viewer";

import {
  boardEntries,
  contextLabel,
  renderBoard,
  taskMetadata,
  views,
  type BoardEntry
} from "./board.ts";
import { OPEN_EVENT, RESULT_MESSAGE } from "./constants.ts";
import type { TaskRecord } from "./records.ts";
import { resultRenderer } from "./render.ts";
import { TaskSource } from "./source.ts";
import type { Tasks } from "./tasks.ts";

const keys = [
  "up",
  "down",
  "pageUp",
  "pageDown",
  "enter",
  "escape",
  "tab",
  "shift+tab",
  "ctrl+b",
  "ctrl+d"
] as const;
const modes = ["summary", "compact", "verbose"] as const;
const transcriptOverlay = {
  anchor: "center",
  width: "100%",
  maxHeight: "100%"
} as const;

const BACKGROUND_BADGE = "background";

/** A Loader whose animated frame is drawn inline, without its own row. */
class Spinner extends Loader {
  frame(): string {
    return this.getRenderedIndicator();
  }
}

/** A scrollable transcript, inline in regular mode and overlaid in fullscreen mode. */
class TranscriptView implements Component {
  private source: TaskSource | undefined;
  private ownedSource = false;
  private sourceUnsubscribe: (() => void) | undefined;
  private viewer: TranscriptViewer | undefined;
  private viewing: string | undefined;
  private scroll: ScrollView | undefined;
  private working: Spinner | undefined;
  private mode = 0;
  private active = true;
  private bodyRows = 0;
  /** The viewer's rendered size, which its mouse layout and row targets use. */
  private content = { width: 0, height: 0 };
  private scrollbar: { height: number; content: number } | undefined;
  private dragging = false;
  private error = "";
  private unsubscribe: () => void;

  constructor(
    private tasks: Tasks,
    private tui: TUI,
    private theme: Theme,
    private close: () => void
  ) {
    this.unsubscribe = tasks.subscribe((event) => {
      if (
        this.ownedSource &&
        this.viewing &&
        (event.kind === "completed" || event.taskId === this.viewing)
      )
        this.source?.start(this.tasks.owned(this.viewing));
      this.updateWorking();
      this.tui.requestRender();
    });
  }

  /** Animate the heading while the viewed task is active, as Pi does while its session streams. */
  private updateWorking(): void {
    const working =
      this.active &&
      this.viewing !== undefined &&
      this.tasks.list().some((task) => task.task_id === this.viewing && task.state === "active");

    if (working && !this.working)
      this.working = new Spinner(
        this.tui,
        (text) => this.theme.fg("accent", text),
        (text) => text,
        ""
      );
    else if (!working && this.working) {
      this.working.stop();
      this.working = undefined;
    }
  }

  open(id: string): void {
    if (!this.active) return;
    const task = this.tasks.owned(id);
    this.closeSource();
    this.error = "";
    this.viewing = id;
    const live = this.tasks.active(id);
    this.ownedSource = !live;
    this.source = live?.source ?? new TaskSource({ task });
    this.sourceUnsubscribe = this.source.subscribe(() => this.installViewer());
    this.installViewer();
    this.updateWorking();
    this.source.refresh();
  }

  private installViewer(): void {
    if (!this.active) return;

    if (!this.viewer && this.source?.model) {
      // Nested cards carry the child session's binding, so accept any task in this tree.
      const open = (task_id: string) => {
        try {
          this.open(task_id);
        } catch {
          /* Foreign or stale task actions are ignored. */
        }
      };

      this.viewer = createTranscriptViewer(this.source.model, {
        ui: this.tui,
        theme: this.theme,
        cwd: this.source.cwd,
        fullscreen: this.tui.mode === "fullscreen",
        requestRender: () => this.tui.requestRender(),
        action: (action) => {
          if (action.event === OPEN_EVENT && action.data.task_id) open(action.data.task_id);
        },
        // Nested completions use the same card as the main chat.
        messageRenderers: new Map([[RESULT_MESSAGE, resultRenderer(open)]])
      });
      this.viewer.setMode(modes[this.mode] ?? "summary");
      this.scroll = new ScrollView(this.viewer, { follow: "end", scrollbar: "hidden" });
    }

    this.tui.requestRender();
  }

  private closeSource(): void {
    this.sourceUnsubscribe?.();
    this.viewer?.dispose();
    if (this.ownedSource) this.source?.dispose();
    this.sourceUnsubscribe = undefined;
    this.viewer = undefined;
    this.source = undefined;
    this.scroll = undefined;
    this.viewing = undefined;
    this.mode = 0;
    this.updateWorking();
  }

  handleInput(data: string): void {
    if (!this.active || isKeyRelease(data)) return;
    if (matchesKey(data, "escape")) this.close();
    else if (matchesKey(data, "ctrl+d")) void this.abort();
    else if (matchesKey(data, "ctrl+o")) {
      this.mode = (this.mode + 1) % modes.length;
      this.viewer?.setMode(modes[this.mode] ?? "summary");
    } else if (matchesKey(data, "up")) this.scroll?.scrollBy(-1);
    else if (matchesKey(data, "down")) this.scroll?.scrollBy(1);
    else if (matchesKey(data, "pageUp"))
      this.scroll?.scrollBy(-Math.max(1, this.scroll.viewportHeight));
    else if (matchesKey(data, "pageDown"))
      this.scroll?.scrollBy(Math.max(1, this.scroll.viewportHeight));
    else if (matchesKey(data, "home")) this.scroll?.scrollToStart();
    else if (matchesKey(data, "end")) this.scroll?.scrollToEnd();
    this.tui.requestRender();
  }

  private async abort(): Promise<void> {
    const id = this.viewing;
    if (!id || !this.working) return;
    this.error = "";

    try {
      await this.tasks.abort(id);
    } catch (error) {
      if (this.active && this.viewing === id)
        this.error = error instanceof Error ? error.message : "Task action failed";
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const rows = Math.max(
      1,
      Math.floor(this.tui.terminal.rows * (this.tui.mode === "fullscreen" ? 1 : 3 / 4))
    );
    // Keep the title and background badge current with the task's live record.
    const record = this.tasks.list().find((task) => task.task_id === this.viewing);
    const name = record
      ? compactDisplayText(
          [
            record.description,
            `${record.model}:${record.thinking}`,
            contextLabel(record),
            ...taskMetadata(this.tasks, record, { full: true })
          ]
            .filter(Boolean)
            .join(" · ")
        )
      : "";
    const spinner = this.working ? `${this.working.frame()} ` : "";
    const title = `${spinner}${this.theme.fg("accent", this.theme.bold(name))}${
      record?.state === "active" && record.background
        ? this.theme.fg("warning", ` · ${BACKGROUND_BADGE}`)
        : ""
    }`;
    const innerRows = Math.max(0, rows - 2);
    // Reserve a transcript row before allocating the footer.
    const footerRows = Math.max(0, innerRows - 1);
    const diagnostics = [
      ...(this.viewer && this.source?.unavailable ? [this.source.unavailable] : []),
      ...(this.error ? [this.error] : [])
    ].map((text) => this.theme.fg("error", compactDisplayText(text)));
    const help = renderHintFooter({
      width,
      // Keep the back control visible before the title, diagnostics, and spacing.
      maxRows: Math.min(footerRows, Math.max(1, footerRows - 1 - diagnostics.length)),
      hints: [
        "Esc back",
        ...(this.working ? ["Ctrl+D abort"] : []),
        `Ctrl+O ${modes[this.mode]}`,
        "↑↓/PgUp/PgDn scroll",
        "Home/End first/last"
      ],
      padding: "",
      separator: " · ",
      style: (text) => this.theme.fg("muted", text)
    });
    // The title sits directly above the hints, with diagnostics above it.
    const info = wrapRows(title, width).slice(0, Math.max(0, footerRows - help.length));
    const footer = [
      ...diagnostics.slice(0, Math.max(0, footerRows - help.length - info.length)),
      ...info,
      ...help
    ];
    if (footer.length < footerRows) footer.unshift("");
    const height = Math.max(0, innerRows - footer.length);
    let body: string[];
    let above = 0;
    let below = 0;
    this.scrollbar = undefined;

    if (this.viewer && this.scroll) {
      // Reserve the last column for the scrollbar, as Pi's transcript does.
      const contentWidth = width > 1 ? width - 1 : width;
      const lines = this.scroll.render(contentWidth);
      this.content = { width: contentWidth, height: lines.length };
      this.scroll.updateLayout(lines.length, height, () => this.tui.requestRender());
      above = this.scroll.scrollTop;
      body = lines.slice(above, above + height);
      below = Math.max(0, lines.length - above - body.length);
      if (contentWidth < width) body = this.paintScrollbar(body, contentWidth, lines.length);
    } else
      body = [
        this.source?.unavailable
          ? this.theme.fg("error", compactDisplayText(this.source.unavailable))
          : this.theme.fg("muted", "Loading transcript…")
      ].slice(0, height);

    this.bodyRows = body.length;
    const padding = Array.from({ length: Math.max(0, height - body.length) }, () => "");

    const color = (text: string) => this.theme.fg("border", text);

    return [
      renderOverflowBorder(width, { color, direction: "↑", hidden: above }),
      ...body,
      ...padding,
      ...footer,
      renderOverflowBorder(width, { color, direction: "↓", hidden: below })
    ]
      .slice(0, rows)
      .map((row) => truncateToWidth(row, width, ""));
  }

  /** Thumb geometry follows Pi's fullscreen scrollbar. */
  private paintScrollbar(body: string[], contentWidth: number, content: number): string[] {
    const track = body.length;
    if (!track || content <= track) return body;
    const thumb = Math.max(
      Math.min(2, track),
      Math.min(track, Math.round((track * track) / content))
    );
    const maxTop = Math.max(0, content - track);
    const offset =
      maxTop === 0 ? 0 : Math.round(((this.scroll?.scrollTop ?? 0) / maxTop) * (track - thumb));
    this.scrollbar = { height: thumb, content };

    return body.map((line, row) => {
      const fitted = truncateToWidth(line, contentWidth, "");
      const gap = " ".repeat(Math.max(0, contentWidth - visibleWidth(fitted)));
      const bar =
        row >= offset && row < offset + thumb
          ? this.theme.fg("scrollbarThumb", "┃")
          : this.theme.fg("scrollbarTrack", "│");

      return `${fitted}\x1b[0m${gap}${bar}`;
    });
  }

  /** Moves the thumb centre to a track row. */
  private dragScrollbar(row: number): void {
    if (!this.scroll || !this.scrollbar) return;
    const { height, content } = this.scrollbar;
    const travel = this.bodyRows - height;
    const maxTop = Math.max(0, content - this.bodyRows);
    const thumbTop = Math.max(0, Math.min(travel, row - Math.floor(height / 2)));
    this.scroll.scrollTo(travel === 0 ? 0 : Math.round((thumbTop / travel) * maxTop));
  }

  handleMouse(event: TuiMouseEvent): ReturnType<NonNullable<Component["handleMouse"]>> {
    if (!this.viewer || !this.scroll) return;

    if (event.type === "wheel") {
      this.scroll.scrollBy(event.wheelDelta ?? 0);

      return { handled: true };
    }

    // The transcript starts below the top border.
    const row = event.y - 1;
    const scrollbar = this.scrollbarMouse(event, row);
    if (scrollbar) return scrollbar;
    if (row < 0 || row >= this.bodyRows || event.x < 0 || event.x >= this.content.width) return;

    // Route in the viewer's own coordinates: an overlay-sized event would miss rows
    // below the first screen and re-measure rows at the scrollbar's extra column.
    return this.viewer.handleMouse({
      ...event,
      y: row + this.scroll.scrollTop,
      width: this.content.width,
      height: this.content.height
    });
  }

  private scrollbarMouse(
    event: TuiMouseEvent,
    row: number
  ): ReturnType<NonNullable<Component["handleMouse"]>> {
    const onScrollbar = event.x === this.content.width && row >= 0 && row < this.bodyRows;

    if (this.dragging && event.type === "release") {
      this.dragging = false;

      return { handled: true };
    }

    if (this.scrollbar && event.type === "press" && event.button === "left" && onScrollbar)
      this.dragging = true;

    // A captured drag continues outside the scrollbar column.
    if (this.dragging && (event.type === "press" || event.type === "drag")) {
      this.dragScrollbar(row);

      return { capture: true };
    }

    return this.dragging || (onScrollbar && this.scrollbar) ? { handled: true } : undefined;
  }

  invalidate(): void {
    this.viewer?.invalidate();
  }

  dispose(): void {
    this.active = false;
    this.unsubscribe();
    this.closeSource();
  }
}

class TaskPanel implements Component {
  private view = 0;
  /** The selected task of each view, restored when the view returns. */
  private selections = new Map<number, string>();
  private selected = 0;
  private entries: BoardEntry[] = [];
  private rows: TaskRecord[] = [];
  private rowTargets: (number | undefined)[] = [];
  private selectionLayout = "";
  private listScroll = new ScrollView(
    { render: (width) => this.renderRows(width), invalidate: () => {} },
    { scrollbar: "hidden" }
  );
  private bodyRows = 0;
  private transcript: TranscriptView | undefined;
  private active = true;
  private error = "";
  private unsubscribe: () => void;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private tasks: Tasks,
    private tui: TUI,
    private theme: Theme,
    private close: () => void
  ) {
    this.unsubscribe = tasks.subscribe(() => this.update());
    this.timer = setInterval(() => tui.requestRender(), 1000);
    this.update();
  }

  get viewingTranscript(): boolean {
    return this.transcript !== undefined;
  }

  private update(id = this.rows[this.selected]?.task_id): void {
    this.entries = boardEntries(this.tasks.list().filter((views[this.view] ?? views[0]).match));
    this.rows = this.entries.map((entry) => entry.task);
    const index = this.rows.findIndex((task) => task.task_id === id);
    this.selected = Math.max(0, Math.min(this.rows.length - 1, index < 0 ? this.selected : index));
    this.tui.requestRender();
  }

  open(id: string): void {
    if (!this.active) return;
    this.tasks.owned(id);
    this.error = "";
    this.transcript ??= new TranscriptView(this.tasks, this.tui, this.theme, () => {
      this.transcript?.dispose();
      this.transcript = undefined;
      this.tui.requestRender();
    });
    this.transcript.open(id);
    this.tui.requestRender();
  }

  ownsFullscreenInput(data: string): boolean {
    return keys.some((key) => matchesKey(data, key));
  }

  handleInput(data: string): void {
    if (!this.active || isKeyRelease(data)) return;
    if (this.transcript) this.transcript.handleInput(data);
    else if (matchesKey(data, "escape")) this.close();
    else this.listInput(data);
    this.tui.requestRender();
  }

  private listInput(data: string): void {
    const task = this.rows[this.selected];
    let step = 0;
    if (matchesKey(data, "shift+tab")) step = views.length - 1;
    else if (matchesKey(data, "tab")) step = 1;

    if (step) {
      if (task) this.selections.set(this.view, task.task_id);
      this.view = (this.view + step) % views.length;
      this.selected = 0;
      this.selectionLayout = "";
      this.update(this.selections.get(this.view));

      return;
    }

    if (matchesKey(data, "up")) {
      this.selected = Math.max(0, this.selected - 1);
      this.selectionLayout = "";
    } else if (matchesKey(data, "down")) {
      this.selected = Math.min(this.rows.length - 1, this.selected + 1);
      this.selectionLayout = "";
    } else if (matchesKey(data, "pageUp")) this.listScroll.scrollBy(-this.bodyRows);
    else if (matchesKey(data, "pageDown")) this.listScroll.scrollBy(this.bodyRows);
    else if (task && matchesKey(data, "enter")) this.open(task.task_id);
    else if (task && matchesKey(data, "ctrl+d"))
      void this.effect(() => this.tasks.abort(task.task_id));
    else if (task && matchesKey(data, "ctrl+b"))
      void this.effect(() => this.tasks.background(task.task_id));
  }

  private async effect(run: () => Promise<unknown>): Promise<void> {
    this.error = "";

    try {
      await run();
    } catch (error) {
      if (this.active) this.error = error instanceof Error ? error.message : "Task action failed";
    }

    if (this.active) this.update();
  }

  private renderRows(width: number): string[] {
    const { lines, targets } = renderBoard(
      this.theme,
      this.tasks,
      this.entries,
      this.selected,
      width
    );
    this.rowTargets = targets;

    return lines;
  }

  render(width: number): string[] {
    if (this.transcript) return this.transcript.render(width);

    const { theme } = this;
    const selected = this.rows[this.selected];
    const all = this.tasks.list();
    const tabs = views
      .map(({ label, match }, index) =>
        theme.fg(index === this.view ? "accent" : "muted", `${label} ${all.filter(match).length}`)
      )
      .join(theme.fg("muted", " | "));
    const help = renderHintFooter({
      width,
      maxRows: Math.max(1, this.tui.terminal.rows - 13),
      hints: [
        "↑↓ select",
        "Enter view",
        "Esc close",
        "Tab view",
        // Offer actions only when they apply to the selected task.
        ...(selected?.state === "active" ? ["Ctrl+D abort"] : []),
        ...(selected?.state === "active" && !selected.background ? ["Ctrl+B background"] : [])
      ],
      padding: "  ",
      separator: " · ",
      style: (text) => theme.fg("dim", text)
    });
    const position = this.rows.length
      ? [theme.fg("dim", `  (${this.selected + 1}/${this.rows.length})`)]
      : [];
    const diagnostics = (this.error ? [this.error] : []).map((text) =>
      this.theme.fg("error", compactDisplayText(text))
    );
    // Two border rows, the title, the view row, and three blank rows frame the list, as in the browser.
    const height = Math.max(
      1,
      this.tui.terminal.rows - 11 - position.length - help.length - diagnostics.length
    );
    const lines = this.listScroll.render(width);
    this.listScroll.updateLayout(lines.length, height, () => this.tui.requestRender());
    const start = this.rowTargets.indexOf(this.selected);
    const end = this.rowTargets.lastIndexOf(this.selected) + 1;
    const layout = `${this.selected}:${start}:${end}:${width}:${height}`;

    if (layout !== this.selectionLayout && start >= 0) {
      // Keep the whole selection visible when it fits. Taller items start at
      // their label and remain fully reachable with page keys or the mouse wheel.
      if (start < this.listScroll.scrollTop || end - start > height)
        this.listScroll.scrollTo(start);
      else if (end > this.listScroll.scrollTop + height) this.listScroll.scrollTo(end - height);
    }

    this.selectionLayout = layout;
    const above = this.listScroll.scrollTop;
    const label = views[this.view]?.label ?? "all";
    const body = lines.length
      ? lines.slice(above, above + height)
      : [theme.fg("dim", label === "all" ? "  No subagents." : `  No ${label} subagents.`)];
    this.bodyRows = body.length;
    // The (n/m) line shows the position, so the borders carry no hidden-row counts.
    const border = theme.fg("border", "─".repeat(width));

    return [
      border,
      theme.fg("accent", theme.bold("Subagents")),
      "",
      truncateToWidth(`${theme.fg("muted", "View: ")}${tabs}`, width, "…"),
      "",
      ...body,
      ...position,
      ...diagnostics,
      "",
      ...help,
      border
    ].map((row) => truncateToWidth(row, width, ""));
  }

  handleMouse(event: TuiMouseEvent): ReturnType<NonNullable<Component["handleMouse"]>> {
    if (this.transcript) return this.transcript.handleMouse(event);

    // Rows 0 to 4 are the top border, the title, the view row, and two blank rows.
    if (event.y < 5 || event.y > this.bodyRows + 4) return;

    if (event.type === "wheel") {
      this.listScroll.scrollBy(event.wheelDelta ?? 0);

      return { handled: true };
    }

    if (event.type === "click" && event.button === "left") {
      const index = this.rowTargets[this.listScroll.scrollTop + event.y - 5];
      if (index === undefined) return;
      const task = this.rows[index];
      if (!task) return;
      this.selected = index;
      this.open(task.task_id);

      return { handled: true };
    }

    return;
  }

  invalidate(): void {
    this.transcript?.invalidate();
  }

  dispose(): void {
    this.active = false;
    this.transcript?.dispose();
    clearInterval(this.timer);
    this.unsubscribe();
  }
}

export class Panels {
  private controller = new AbortController();
  private panel: TaskPanel | undefined;
  private opened: Promise<void> | undefined;

  constructor(
    private tasks: Tasks,
    private ctx: ExtensionContext
  ) {}

  open(taskId?: string): Promise<void> {
    if (this.controller.signal.aborted || this.ctx.mode !== "tui") return Promise.resolve();
    if (taskId) this.tasks.owned(taskId);

    if (this.opened) {
      if (taskId) this.panel?.open(taskId);

      return this.opened;
    }

    this.opened = openResponsiveCustomUI({
      ui: this.ctx.ui,
      signal: this.controller.signal,
      useOverlay: (tui) => tui.mode === "fullscreen" && !!this.panel?.viewingTranscript,
      overlayOptions: transcriptOverlay,
      onInputRoutingUnavailable: () =>
        this.ctx.ui.notify("Subagent panel key routing unavailable", "warning"),
      create: (tui, theme, _keys, close) => {
        this.panel = new TaskPanel(this.tasks, tui, theme, close);
        if (taskId) this.panel.open(taskId);

        return this.panel;
      }
    }).finally(() => {
      this.opened = undefined;
      this.panel = undefined;
    });

    return this.opened;
  }

  dispose(): void {
    this.controller.abort();
  }
}
