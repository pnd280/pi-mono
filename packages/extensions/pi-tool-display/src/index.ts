import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";
import { noticeType } from "pi-nested-instructions/notices";
import { JOB_RESULT_MESSAGE, RESULT_MESSAGE } from "pi-subagents/constants";

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
  pi.registerMessageRenderer(RESULT_MESSAGE, createSubagentResultRenderer(emit));
  pi.registerMessageRenderer(JOB_RESULT_MESSAGE, createJobResultRenderer(emit));
  const warnings: string[] = [];
  let notify: ((message: string) => void) | undefined;
  const stderr = (message: string) => process.stderr.write(`${message}\n`);

  const warning = (message: string) => {
    if (notify) notify(message);
    else warnings.push(message);
  };

  const collection = new DisplayCollectors((type, data) => pi.appendEntry(type, data), warning);
  const dispose = installHostIntegration(collection, emit);
  let live: typeof notify;
  joinLifecycle(pi, { id: "pi-tool-display" }).onSessionShutdown(
    () => {
      // Stops observation and appends before any participant awaits. Warnings wait for cleanup,
      // which knows whether the terminal has stopped.
      dispose?.();
      live = notify;
      notify = undefined;
      collection.dispose();
    },
    // The session context stays valid until the handler ends, so flush warnings still show.
    (event, context) => {
      // A TUI quit stops the terminal before this handler, so warnings print once Pi exits.
      const flush =
        event.reason === "quit" && context.mode === "tui"
          ? (message: string) => process.once("exit", () => stderr(message))
          : live;
      if (flush) warnings.splice(0).forEach(flush);
    }
  );
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
