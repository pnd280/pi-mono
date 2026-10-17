import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";

import type { RunReader } from "../history/reader.ts";
import type { Jobs } from "../jobs/registry.ts";
import type { Tasks } from "../tasks/registry.ts";
import type * as PanelModule from "./panel.ts";
import type { TaskPanel } from "./panel.ts";

// The panel and its viewers load at the first open. Concurrent opens share one import.
let panel: Promise<typeof PanelModule> | undefined;
const loadPanel = () => (panel ??= import("./panel.ts"));

const transcriptOverlay = {
  anchor: "center",
  width: "100%",
  maxHeight: "100%"
} as const;

/** Opens one task panel at a time, until its tasks or jobs stop. */
export class Panels {
  private controller = new AbortController();
  private panel: TaskPanel | undefined;
  private opened: Promise<void> | undefined;
  /** The latest selection requested before the panel exists. */
  private select: ((panel: TaskPanel) => void) | undefined;

  constructor(
    private tasks: Tasks,
    private jobs: Jobs,
    private reader: RunReader,
    private ctx: Pick<ExtensionContext, "mode" | "ui">
  ) {}

  open(taskId?: string): Promise<void> {
    if (taskId) this.tasks.owned(taskId);

    return this.show(taskId ? (panel) => panel.open(taskId) : undefined);
  }

  /** Opens the panel at a job's log. */
  openJob(jobId: string): Promise<void> {
    this.jobs.owned(jobId);

    return this.show((panel) => panel.openJob(jobId));
  }

  private show(select?: (panel: TaskPanel) => void): Promise<void> {
    if (this.controller.signal.aborted || this.ctx.mode !== "tui") return Promise.resolve();

    if (this.opened) {
      if (this.panel) select?.(this.panel);
      else if (select) this.select = select;

      return this.opened;
    }

    this.select = select;
    this.opened = loadPanel()
      .then(({ TaskPanel }) => {
        // The session can end while the panel loads; a panel built then would keep its timer.
        if (this.controller.signal.aborted) return;

        return openResponsiveCustomUI({
          ui: this.ctx.ui,
          signal: this.controller.signal,
          useOverlay: (tui) => tui.mode === "fullscreen" && !!this.panel?.viewingTranscript,
          overlayOptions: transcriptOverlay,
          onInputRoutingUnavailable: () =>
            this.ctx.ui.notify("Subagent panel key routing unavailable", "warning"),
          create: (tui, theme, _keys, close) => {
            this.panel = new TaskPanel(this.tasks, this.jobs, this.reader, tui, theme, close);
            this.select?.(this.panel);
            this.select = undefined;

            return this.panel;
          }
        });
      })
      .finally(() => {
        this.opened = undefined;
        this.panel = undefined;
        this.select = undefined;
      });

    return this.opened;
  }

  dispose(): void {
    this.controller.abort();
  }
}
