import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

import { createTranscriptModel, createTranscriptViewer } from "../src/viewer/index.ts";

/** Manual side-by-side inspection of the public foreign viewer and the original transcript. */
export function registerViewerFixture(pi: ExtensionAPI): void {
  pi.registerCommand("display-viewer", {
    description: "Inspect this fixture through the read-only foreign viewer",
    handler: async (_args, ctx) => {
      const model = createTranscriptModel({
        sessionId: ctx.sessionManager.getSessionId(),
        cwd: ctx.cwd,
        entries: ctx.sessionManager.getEntries(),
        leafId: ctx.sessionManager.getLeafId()
      });

      try {
        await ctx.ui.custom<void>((tui, theme, _keys, done) => {
          const viewer = createTranscriptViewer(model, {
            ui: tui,
            theme,
            cwd: ctx.cwd,
            fullscreen: tui.mode === "fullscreen",
            requestRender: () => tui.requestRender()
          });
          let offset = 0;
          let total = 0;
          let mode = 0;
          const modes = ["summary", "compact", "verbose"] as const;

          return {
            render(width) {
              const rows = viewer.render(width);
              total = rows.length;
              offset = Math.max(0, Math.min(offset, total - Math.max(1, tui.terminal.rows - 4)));

              return rows.slice(offset, offset + Math.max(1, tui.terminal.rows - 4));
            },
            invalidate: () => viewer.invalidate(),
            handleMouse: (event) => viewer.handleMouse({ ...event, y: event.y + offset }),
            handleInput(data) {
              if (matchesKey(data, "escape")) {
                done();

                return;
              }

              if (matchesKey(data, "ctrl+o")) {
                mode = (mode + 1) % modes.length;
                viewer.setMode(modes[mode] ?? "summary");
              } else if (matchesKey(data, "up")) offset--;
              else if (matchesKey(data, "down")) offset++;
              else if (matchesKey(data, "pageUp")) offset -= tui.terminal.rows - 4;
              else if (matchesKey(data, "pageDown")) offset += tui.terminal.rows - 4;
              else if (matchesKey(data, "home")) offset = 0;
              else if (matchesKey(data, "end")) offset = total;
              tui.requestRender();
            },
            dispose: () => viewer.dispose()
          };
        });
      } finally {
        model.dispose();
      }
    }
  });
}
