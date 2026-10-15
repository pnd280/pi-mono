import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text } from "@earendil-works/pi-tui";

import type { Jobs } from "./jobs.ts";
import type { Tasks } from "./tasks.ts";

const WIDGET_KEY = "pi-subagents";

const count = (value: number, singular: string, plural: string) =>
  value ? `${value} ${value === 1 ? singular : plural}` : "";

/** Active tasks and jobs; stopped tasks no longer count. `refresh` recounts at once. */
export function taskWidget(
  tasks: Tasks,
  jobs: Jobs,
  ctx: ExtensionContext,
  open: () => void
): { refresh(): void; dispose(): void } {
  if (ctx.mode !== "tui") return { refresh() {}, dispose() {} };

  let previous = "";

  const update = () => {
    const text = [
      count(
        tasks.activeBinding ? tasks.list().filter((task) => task.state === "active").length : 0,
        "subagent",
        "subagents"
      ),
      count(jobs.list().filter((job) => job.state === "active").length, "job", "jobs")
    ]
      .filter(Boolean)
      .join(" · ");
    if (text === previous) return;
    previous = text;
    ctx.ui.setWidget(
      WIDGET_KEY,
      text
        ? (tui, theme) => {
            let dim = false;
            const timer = setInterval(() => {
              dim = !dim;
              tui.requestRender();
            }, 600);
            const region = new MouseRegion(
              {
                render: (width) =>
                  new Text(theme.fg(dim ? "dim" : "muted", text), 0, 0).render(width),
                invalidate() {}
              },
              (event) => {
                if (tui.mode !== "fullscreen" || event.type !== "click" || event.button !== "left")
                  return;
                open();

                return { handled: true };
              }
            );

            return Object.assign(region, { dispose: () => clearInterval(timer) });
          }
        : undefined
    );
  };

  const unsubscribe = [tasks.subscribe(update), jobs.subscribe(update)];
  update();

  return {
    refresh: update,
    dispose() {
      for (const stop of unsubscribe) stop();
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  };
}
