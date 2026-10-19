import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { noticeType } from "pi-nested-instructions/notices";

import { subagentResultType } from "./adapters/pi-subagents/index.ts";
import { jobResultType } from "./adapters/pi-subagents/jobs.ts";
import type { DisplayAction } from "./contracts.ts";
import { DisplayCollectors } from "./host/collection.ts";
import { installHostIntegration } from "./host/install.ts";
import { createNoticeRenderer } from "./rendering/notice.ts";
import {
  createJobResultRenderer,
  createSubagentResultRenderer
} from "./rendering/subagent-result.ts";

export default function toolDisplay(pi: ExtensionAPI): void {
  const emit = (action: DisplayAction) => pi.events.emit(action.event, action.data);
  pi.registerMessageRenderer(noticeType, createNoticeRenderer());
  pi.registerMessageRenderer(subagentResultType, createSubagentResultRenderer(emit));
  pi.registerMessageRenderer(jobResultType, createJobResultRenderer(emit));
  const warnings: string[] = [];
  let notify: ((message: string) => void) | undefined;
  const stderr = (message: string) => process.stderr.write(`${message}\n`);

  const warning = (message: string) => {
    if (notify) notify(message);
    else warnings.push(message);
  };

  const collection = new DisplayCollectors((type, data) => pi.appendEntry(type, data), warning);
  const dispose = installHostIntegration(collection, emit);
  // Pi awaits this handler, so lines queued during local file setup reach the file.
  // The session context stays valid until the handler ends, so flush warnings still show.
  pi.on("session_shutdown", async (event, context) => {
    dispose?.();
    // A TUI quit stops the terminal before this handler, so warnings print once Pi exits.
    if (event.reason === "quit" && context.mode === "tui")
      notify = (message) => process.once("exit", () => stderr(message));
    await collection.dispose();
    notify = undefined;
  });
  pi.on("session_start", (_event, context) => {
    // Print and JSON sessions have no notifications; stderr keeps their stdout output intact.
    notify = context.hasUI ? (message) => context.ui.notify(message, "warning") : stderr;
    collection.start(context.sessionManager);
    if (context.mode !== "tui") dispose?.();
    else if (!dispose)
      warnings.push(
        "pi-tool-display: private TUI display lookup unavailable; keeping original rendering."
      );
    warnings.splice(0).forEach(notify);
  });
}
