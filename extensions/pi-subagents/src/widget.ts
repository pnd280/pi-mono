import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text } from "@earendil-works/pi-tui";

import type { Jobs } from "./jobs/registry.ts";
import type { Tasks } from "./tasks/registry.ts";

const WIDGET_KEY = "pi-subagents";

const count = (value: number, singular: string, plural: string) =>
  value ? `${value} ${value === 1 ? singular : plural}` : "";

/** Active tasks and jobs; without `tasks`, such as while a session change stops them, only jobs. */
export function taskWidget(
  tasks: Tasks | undefined,
  jobs: Jobs,
  ctx: Pick<ExtensionContext, "mode" | "ui">,
  open: () => void
): { dispose(): void } {
  if (ctx.mode !== "tui") return { dispose() {} };

  let previous = "";

  const update = () => {
    const text = [
      count(tasks?.tree.active().length ?? 0, "subagent", "subagents"),
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

  const unsubscribe = [jobs.subscribe(update), ...(tasks ? [tasks.subscribe(update)] : [])];
  update();

  return {
    dispose() {
      for (const stop of unsubscribe) stop();
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  };
}
