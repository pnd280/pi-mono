import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { MouseRegion, Text } from "@earendil-works/pi-tui";

import type { Tasks } from "./tasks.ts";

const WIDGET_KEY = "pi-subagents";

export function taskWidget(tasks: Tasks, ctx: ExtensionContext, open: () => void): () => void {
  if (ctx.mode !== "tui") return () => {};

  let previous = -1;

  const update = () => {
    const count = tasks.list().filter((task) => task.state === "active").length;
    if (count === previous) return;
    previous = count;
    ctx.ui.setWidget(
      WIDGET_KEY,
      count
        ? (tui, theme) => {
            let dim = false;
            const timer = setInterval(() => {
              dim = !dim;
              tui.requestRender();
            }, 600);
            const region = new MouseRegion(
              {
                render: (width) =>
                  new Text(
                    theme.fg(
                      dim ? "dim" : "muted",
                      `↓ ${count} ${count === 1 ? "subagent" : "subagents"}`
                    ),
                    0,
                    0
                  ).render(width),
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

  const unsubscribe = tasks.subscribe(update);
  update();

  return () => {
    unsubscribe();
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  };
}
