import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  isKeyRelease,
  ScrollView,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { renderHintFooter } from "@pi-mono/libs/tui/components/hint-footer";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import type { RunReader, TaskView } from "../history/reader.ts";
import type { Jobs } from "../jobs/registry.ts";
import type { Tasks } from "../tasks/registry.ts";
import { createRenderers } from "../tasks/render.ts";
import { boardEntries, entryId, renderBoard, views, type BoardEntry } from "./board.ts";
import { PanelControls, type PanelAction, type PanelKeys } from "./controls.ts";
import { JobLogView } from "./job-viewer.ts";
import { renderViewer, Spinner, taskRows, type ViewerBody } from "./viewer-frame.ts";
import { TranscriptViewer } from "./viewer.ts";

/** A scrollable transcript, inline in regular mode and overlaid in fullscreen mode. */
class TranscriptView implements Component {
  private source: TaskView | undefined;
  private sourceUnsubscribe: (() => void) | undefined;
  /** Built once the view shows a run; the view keeps its transcript for each run of the task. */
  private viewer: TranscriptViewer | undefined;
  private viewing: string | undefined;
  private scroll: ScrollView | undefined;
  private working: Spinner | undefined;
  private expanded = false;
  private active = true;
  private bodyRows = 0;
  /** The first body row, below the title, the metadata, and the top overflow border. */
  private bodyTop = 1;
  /** The viewer's rendered size, which its mouse layout and row targets use. */
  private content = { width: 0, height: 0, top: 0 };
  private scrollbar: { height: number; content: number } | undefined;
  private dragging = false;
  private error = "";
  private unsubscribe: () => void;
  private controls: PanelControls;

  constructor(
    private tasks: Tasks,
    private reader: RunReader,
    private tui: TUI,
    private theme: Theme,
    keys: PanelKeys,
    private close: () => void
  ) {
    this.controls = new PanelControls(keys, "task");
    this.unsubscribe = tasks.subscribe(() => {
      this.updateWorking();
      this.tui.requestRender();
    });
  }

  /** Animate the status while the viewed task is active, as Pi does while its session streams. */
  private updateWorking(): void {
    const working =
      this.active &&
      this.viewing !== undefined &&
      this.tasks.tree.find(this.viewing)?.state === "active";

    if (working && !this.working) this.working = new Spinner(this.tui);
    else if (!working && this.working) {
      this.working.stop();
      this.working = undefined;
    }
  }

  open(id: string): void {
    if (!this.active) return;
    const source = this.reader.observe(id);
    this.closeSource();
    this.error = "";
    this.viewing = id;
    this.source = source;
    this.sourceUnsubscribe = this.source.subscribe(() => this.installViewer());
    this.installViewer();
    this.updateWorking();
  }

  private installViewer(): void {
    if (!this.active) return;
    const transcript = this.source?.transcript;

    if (!this.viewer && transcript) {
      // Nested cards carry the child session's binding, so accept any task in this tree.
      const open = (task_id: string) => {
        try {
          this.open(task_id);
        } catch {
          /* Foreign or stale task actions are ignored. */
        }
      };

      // Nested calls use the same cards as the main chat.
      this.viewer = new TranscriptViewer(transcript, {
        ui: this.tui,
        cwd: this.source?.cwd ?? "",
        tools: new Map([
          ["subagent", createRenderers(open)],
          ["subagent_abort", createRenderers(open, "subagent_abort")]
        ])
      });
      this.viewer.setExpanded(this.expanded);
      this.scroll = new ScrollView(this.viewer, { follow: "end", scrollbar: "hidden" });
    }

    this.tui.requestRender();
  }

  private closeSource(): void {
    this.sourceUnsubscribe?.();
    this.viewer?.dispose();
    this.source?.dispose();
    this.sourceUnsubscribe = undefined;
    this.viewer = undefined;
    this.source = undefined;
    this.scroll = undefined;
    this.viewing = undefined;
    this.expanded = false;
    this.dragging = false;
    this.scrollbar = undefined;
    this.updateWorking();
  }

  ownsFullscreenInput(data: string): boolean {
    return this.active && this.controls.actionFor(data) !== undefined;
  }

  handleInput(data: string): void {
    if (!this.active || isKeyRelease(data)) return;
    const action = this.controls.actionFor(data);
    if (action === "cancel") this.close();
    else if (action === "abort") void this.abort();
    else if (action === "expand") {
      this.expanded = !this.expanded;
      this.viewer?.setExpanded(this.expanded);
    } else if (action === "up") this.scroll?.scrollBy(-1);
    else if (action === "down") this.scroll?.scrollBy(1);
    else if (action === "pageUp") this.scroll?.scrollBy(-Math.max(1, this.scroll.viewportHeight));
    else if (action === "pageDown") this.scroll?.scrollBy(Math.max(1, this.scroll.viewportHeight));
    else if (action === "first") this.scroll?.scrollToStart();
    else if (action === "last") this.scroll?.scrollToEnd();
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
    // Keep the header current with the task's live record.
    const { tree } = this.tasks;
    const record = this.viewing === undefined ? undefined : tree.find(this.viewing);
    const parent = record?.parent_task_id ? tree.find(record.parent_task_id) : undefined;
    const { rows, bodyTop } = renderViewer({
      tui: this.tui,
      theme: this.theme,
      width,
      kind: "task",
      subject: record && {
        description: record.description,
        id: record.task_id,
        metadata: taskRows(this.theme, record, parent, this.working?.frame())
      },
      diagnostics: [
        ...(this.viewer && this.source?.unavailable ? [this.source.unavailable] : []),
        ...(this.error ? [this.error] : [])
      ],
      hints: [
        this.controls.hint("cancel", "back"),
        ...(this.working ? [this.controls.hint("abort", "abort")] : []),
        this.controls.hint("expand", this.expanded ? "collapse" : "expand"),
        ...this.controls.scrollHints()
      ],
      body: (height) => this.body(width, height)
    });
    this.bodyTop = bodyTop;

    return rows;
  }

  /** The transcript beside its scrollbar, or the loading or unavailable text. */
  private body(width: number, height: number): ViewerBody {
    let body: string[];
    let above = 0;
    let below = 0;
    this.scrollbar = undefined;

    if (this.viewer && this.scroll) {
      // Reserve the last column for the scrollbar, as Pi's transcript does.
      const contentWidth = width > 1 ? width - 1 : width;
      const lines = this.scroll.render(contentWidth);
      this.scroll.updateLayout(lines.length, height, () => this.tui.requestRender());
      above = this.scroll.scrollTop;
      this.content = { width: contentWidth, height: lines.length, top: above };
      body = lines.slice(above, above + height);
      below = Math.max(0, lines.length - above - body.length);
      if (contentWidth < width) body = this.paintScrollbar(body, contentWidth, lines.length);
    } else
      body = [
        this.source?.unavailable
          ? this.theme.fg("error", compactDisplayText(this.source.unavailable))
          : this.theme.fg("dim", "Loading transcript…")
      ].slice(0, height);

    this.bodyRows = body.length;

    return { lines: body, above, below };
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
    if (!this.active || !this.viewer || !this.scroll) return;

    if (event.type === "wheel") {
      this.scroll.scrollBy(event.wheelDelta ?? 0);

      return { handled: true };
    }

    const row = event.y - this.bodyTop;
    const scrollbar = this.scrollbarMouse(event, row);
    if (scrollbar) return scrollbar;
    if (row < 0 || row >= this.bodyRows || event.x < 0 || event.x >= this.content.width) return;

    // Route in the viewer's own coordinates: an overlay-sized event would miss rows
    // below the first screen and re-measure rows at the scrollbar's extra column.
    return this.viewer.handleMouse({
      ...event,
      y: row + this.content.top,
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

export class TaskPanel implements Component {
  private view = 0;
  /** The selected task or job of each view, restored when the view returns. */
  private selections = new Map<number, string>();
  private selected = 0;
  private entries: BoardEntry[] = [];
  private rowTargets: (number | undefined)[] = [];
  /** Mouse targets belong to the entries last drawn, even if a live update reorders the list. */
  private renderedEntries: readonly BoardEntry[] = [];
  private renderedTop = 0;
  private selectionLayout = "";
  private listScroll = new ScrollView(
    { render: (width) => this.renderRows(width), invalidate: () => {} },
    { scrollbar: "hidden" }
  );
  private bodyRows = 0;
  private transcript: TranscriptView | JobLogView | undefined;
  private active = true;
  private error = "";
  private unsubscribe: () => void;
  private unsubscribeJobs: () => void;
  private timer: ReturnType<typeof setInterval>;
  private unobserve: () => void;
  private controls: PanelControls;

  constructor(
    private tasks: Tasks,
    private jobs: Jobs,
    private reader: RunReader,
    private tui: TUI,
    private theme: Theme,
    private keys: PanelKeys,
    private close: () => void
  ) {
    this.controls = new PanelControls(keys, "panel");
    this.unsubscribe = tasks.subscribe(() => this.update());
    this.unsubscribeJobs = jobs.subscribe(() => this.update());
    // Elapsed times advance every second.
    this.timer = setInterval(() => tui.requestRender(), 1000);
    this.update();
    // The tree reads child files while the panel is open; a read that changes it emits an update.
    this.unobserve = tasks.tree.observe();
  }

  get viewingTranscript(): boolean {
    return this.transcript !== undefined;
  }

  private update(id = this.selectedEntry && entryId(this.selectedEntry)): void {
    const view = views[this.view] ?? views[0];
    this.entries = boardEntries(
      this.tasks.tree.list().filter(view.match),
      this.jobs.list().filter(view.matchJob)
    );
    const index = this.entries.findIndex((entry) => entryId(entry) === id);
    this.selected = Math.max(
      0,
      Math.min(this.entries.length - 1, index < 0 ? this.selected : index)
    );
    this.tui.requestRender();
  }

  private get selectedEntry(): BoardEntry | undefined {
    return this.entries[this.selected];
  }

  private closeDetail = () => {
    this.transcript?.dispose();
    this.transcript = undefined;
    this.tui.requestRender();
  };

  open(id: string): void {
    if (!this.active) return;
    this.tasks.owned(id);
    this.error = "";

    if (!(this.transcript instanceof TranscriptView)) {
      this.transcript?.dispose();
      this.transcript = new TranscriptView(
        this.tasks,
        this.reader,
        this.tui,
        this.theme,
        this.keys,
        this.closeDetail
      );
    }

    this.transcript.open(id);
    this.tui.requestRender();
  }

  openJob(id: string): void {
    if (!this.active) return;
    const view = new JobLogView(this.jobs, id, this.tui, this.theme, this.keys, this.closeDetail);
    this.error = "";
    this.transcript?.dispose();
    this.transcript = view;
    this.tui.requestRender();
  }

  private openEntry(entry: BoardEntry): void {
    if (entry.kind === "task") this.open(entry.task.task_id);
    else this.openJob(entry.job.job_id);
  }

  ownsFullscreenInput(data: string): boolean {
    if (!this.active) return false;

    return this.transcript
      ? this.transcript.ownsFullscreenInput(data)
      : this.controls.actionFor(data) !== undefined;
  }

  handleInput(data: string): void {
    if (!this.active || isKeyRelease(data)) return;

    if (this.transcript) this.transcript.handleInput(data);
    else {
      const action = this.controls.actionFor(data);
      if (action === "cancel") this.close();
      else if (this.tui.terminal.rows >= 10) this.listInput(action);
    }

    this.tui.requestRender();
  }

  private listInput(action: PanelAction | undefined): void {
    const entry = this.selectedEntry;
    const task = entry?.kind === "task" ? entry.task : undefined;
    let step = 0;
    if (action === "previousView") step = views.length - 1;
    else if (action === "nextView") step = 1;

    if (step) {
      if (entry) this.selections.set(this.view, entryId(entry));
      this.view = (this.view + step) % views.length;
      this.selected = 0;
      this.selectionLayout = "";
      this.update(this.selections.get(this.view));

      return;
    }

    if (action === "up") {
      this.selected = Math.max(0, this.selected - 1);
      this.selectionLayout = "";
    } else if (action === "down") {
      this.selected = Math.min(this.entries.length - 1, this.selected + 1);
      this.selectionLayout = "";
    } else if (action === "pageUp") this.listScroll.scrollBy(-this.bodyRows);
    else if (action === "pageDown") this.listScroll.scrollBy(this.bodyRows);
    else if (entry && action === "confirm") this.openEntry(entry);
    else if (task && action === "abort") void this.effect(() => this.tasks.abort(task.task_id));
    // The user cancelled the job, so its result is still delivered.
    else if (entry?.kind === "job" && action === "abort")
      void this.effect(() => this.jobs.abort(entry.job.job_id));
    else if (task && action === "background")
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
    this.renderedEntries = this.entries;

    return lines;
  }

  /** Actions that apply to the selected task or job. A job has no foreground. */
  private actionHints(): string[] {
    const entry = this.selectedEntry;
    if (!entry) return [];
    if (entry.kind === "job")
      return entry.job.state === "active" ? [this.controls.hint("abort", "abort")] : [];
    if (entry.task.state !== "active") return [];

    return [
      this.controls.hint("abort", "abort"),
      ...(entry.task.background ? [] : [this.controls.hint("background", "background")])
    ];
  }

  /** Each view with its number of tasks and jobs. */
  private tabs(): string {
    const tasks = this.tasks.tree.list();
    const jobs = this.jobs.list();

    return views
      .map(({ label, match, matchJob }, index) =>
        this.theme.fg(
          index === this.view ? "accent" : "muted",
          `${label} ${tasks.filter(match).length + jobs.filter(matchJob).length}`
        )
      )
      .join(this.theme.fg("muted", " | "));
  }

  render(width: number): string[] {
    if (this.transcript) return this.transcript.render(width);

    const { theme } = this;

    if (this.tui.terminal.rows < 10) {
      this.bodyRows = 0;

      return [this.controls.hint("cancel", "close"), "Resize to at least 10 rows."]
        .slice(0, Math.max(0, this.tui.terminal.rows))
        .map((row) => truncateToWidth(row, width));
    }

    const tabs = this.tabs();
    const help = renderHintFooter({
      width,
      maxRows: Math.max(1, this.tui.terminal.rows - 13),
      hints: [
        this.controls.hint("cancel", "close"),
        ...this.controls.navigationHints("select"),
        this.controls.hint("confirm", "inspect"),
        this.controls.hint("nextView", "view"),
        ...this.actionHints()
      ],
      padding: "  ",
      separator: " · ",
      style: (text) => theme.fg("dim", text)
    });
    const position = this.entries.length
      ? [theme.fg("dim", `  (${this.selected + 1}/${this.entries.length})`)]
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
    this.renderedTop = above;
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
    if (!this.active) return;
    if (this.transcript) return this.transcript.handleMouse(event);

    // Rows 0 to 4 are the top border, the title, the view row, and two blank rows.
    if (event.y < 5 || event.y > this.bodyRows + 4) return;

    if (event.type === "wheel") {
      this.listScroll.scrollBy(event.wheelDelta ?? 0);

      return { handled: true };
    }

    if (event.type === "click" && event.button === "left") {
      const index = this.rowTargets[this.renderedTop + event.y - 5];
      if (index === undefined) return;
      const entry = this.renderedEntries[index];
      if (!entry) return;
      const current = this.entries.findIndex((item) => entryId(item) === entryId(entry));
      if (current < 0) return;
      this.selected = current;
      this.openEntry(entry);

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
    this.unobserve();
    this.unsubscribe();
    this.unsubscribeJobs();
  }
}
