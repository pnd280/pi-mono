import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  isKeyRelease,
  ScrollView,
  type Component,
  type TUI,
  type TuiMouseEvent
} from "@earendil-works/pi-tui";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { wrapRows } from "@pi-mono/libs/tui/text-budget";

import { readLogTail } from "../jobs/log.ts";
import type { Jobs } from "../jobs/registry.ts";
import { PanelControls, type PanelKeys } from "./controls.ts";
import { jobRows, renderViewer, Spinner, type ViewerBody } from "./viewer-frame.ts";

/** A live log follows its file at this interval. */
const LOG_REFRESH_MS = 1000;

/** The end of one job's log file, inline in regular mode and overlaid in fullscreen mode. */
export class JobLogView implements Component {
  /** Display lines of the latest read; prepared outside render. */
  private lines: string[] = [];
  private wrapped: { width: number; rows: string[] } | undefined;
  /** Display lines of the command; prepared outside render. */
  private command: string[];
  private working: Spinner | undefined;
  private loaded = false;
  private unavailable = "";
  private error = "";
  private active = true;
  private reading = false;
  /** An event arrived during a read; read once more after it. */
  private again = false;
  private bodyRows = 0;
  private scroll = new ScrollView(
    { render: (width) => this.wrap(width), invalidate: () => (this.wrapped = undefined) },
    { follow: "end", scrollbar: "hidden" }
  );
  private timer: ReturnType<typeof setInterval>;
  private unsubscribe: () => void;
  private controls: PanelControls;

  constructor(
    private jobs: Jobs,
    readonly jobId: string,
    private tui: TUI,
    private theme: Theme,
    keys: PanelKeys,
    private close: () => void
  ) {
    this.controls = new PanelControls(keys, "job");
    this.command = displayText(jobs.owned(jobId).command).split("\n");
    // The last read after the exit shows the complete end of the log.
    this.unsubscribe = jobs.subscribe(() => {
      this.updateWorking();
      void this.read();
    });
    this.timer = setInterval(() => {
      if (this.record()?.state === "active") void this.read();
      tui.requestRender();
    }, LOG_REFRESH_MS);
    this.updateWorking();
    void this.read();
  }

  /** Animate the status while the job is active. */
  private updateWorking(): void {
    const working = this.active && this.record()?.state === "active";

    if (working && !this.working) this.working = new Spinner(this.tui);
    else if (!working && this.working) {
      this.working.stop();
      this.working = undefined;
    }
  }

  private record() {
    return this.jobs.list().find((job) => job.job_id === this.jobId);
  }

  private async read(): Promise<void> {
    const record = this.record();
    if (!this.active || !record) return;

    if (this.reading) {
      this.again = true;

      return;
    }

    this.reading = true;

    try {
      const text = await readLogTail(record.log_file);
      const output = displayText(text);
      this.lines = output ? output.replace(/\n$/, "").split("\n") : [];
      this.unavailable = "";
    } catch (error) {
      this.lines = [];
      this.unavailable = `Log file unavailable: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.reading = false;
      this.loaded = true;
      this.wrapped = undefined;
    }

    this.tui.requestRender();

    if (this.again) {
      this.again = false;
      void this.read();
    }
  }

  private wrap(width: number): string[] {
    if (this.wrapped?.width !== width)
      this.wrapped = {
        width,
        rows: this.lines.flatMap((line) => (line ? wrapRows(line, width) : [""]))
      };

    return this.wrapped.rows;
  }

  ownsFullscreenInput(data: string): boolean {
    return this.active && this.controls.actionFor(data) !== undefined;
  }

  handleInput(data: string): void {
    if (!this.active || isKeyRelease(data)) return;
    const action = this.controls.actionFor(data);
    if (action === "cancel") this.close();
    else if (action === "abort") void this.abort();
    else if (action === "up") this.scroll.scrollBy(-1);
    else if (action === "down") this.scroll.scrollBy(1);
    else if (action === "pageUp") this.scroll.scrollBy(-Math.max(1, this.bodyRows));
    else if (action === "pageDown") this.scroll.scrollBy(Math.max(1, this.bodyRows));
    else if (action === "first") this.scroll.scrollToStart();
    else if (action === "last") this.scroll.scrollToEnd();
    this.tui.requestRender();
  }

  private async abort(): Promise<void> {
    if (this.record()?.state !== "active") return;
    this.error = "";

    try {
      await this.jobs.abort(this.jobId);
    } catch (error) {
      if (this.active) this.error = error instanceof Error ? error.message : "Job action failed";
    }

    this.tui.requestRender();
  }

  render(width: number): string[] {
    const record = this.record();
    const active = record?.state === "active";
    const lines = this.scroll.render(width);
    // With no log rows, the reserved body row tells why the log is unavailable.
    const unavailableInBody = !lines.length && this.loaded && Boolean(this.unavailable);

    return renderViewer({
      tui: this.tui,
      theme: this.theme,
      width,
      kind: "job",
      subject: record && {
        description: record.description,
        id: record.job_id,
        metadata: jobRows(this.theme, record, this.command, this.working?.frame())
      },
      diagnostics: [
        ...(this.unavailable && !unavailableInBody ? [this.unavailable] : []),
        ...(this.error ? [this.error] : [])
      ],
      hints: [
        this.controls.hint("cancel", "back"),
        ...(active ? [this.controls.hint("abort", "abort")] : []),
        ...this.controls.scrollHints()
      ],
      body: (height) => this.body(lines, unavailableInBody, height)
    }).rows;
  }

  /** The visible log rows, or the loading, empty, or unavailable text. */
  private body(lines: string[], unavailableInBody: boolean, height: number): ViewerBody {
    this.scroll.updateLayout(lines.length, height, () => this.tui.requestRender());
    const above = this.scroll.scrollTop;
    let body = lines.slice(above, above + height).map((row) => this.theme.fg("toolOutput", row));
    const below = Math.max(0, lines.length - above - body.length);

    if (!lines.length) {
      let empty = this.theme.fg("dim", this.loaded ? "(no output)" : "Loading log…");
      if (unavailableInBody) empty = this.theme.fg("error", compactDisplayText(this.unavailable));
      body = [empty].slice(0, height);
    }

    this.bodyRows = body.length;

    return { lines: body, above, below };
  }

  handleMouse(event: TuiMouseEvent): ReturnType<NonNullable<Component["handleMouse"]>> {
    if (!this.active || event.type !== "wheel") return;
    this.scroll.scrollBy(event.wheelDelta ?? 0);

    return { handled: true };
  }

  invalidate(): void {
    this.wrapped = undefined;
  }

  dispose(): void {
    this.active = false;
    this.updateWorking();
    clearInterval(this.timer);
    this.unsubscribe();
  }
}
