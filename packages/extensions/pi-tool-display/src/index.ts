import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { noticeType } from "pi-nested-instructions/notices";

import { createNoticeRenderer } from "./adapters/pi-nested-instructions/index.ts";
import { DisplayCollectors } from "./host/collection.ts";
import { installHostIntegration } from "./host/install.ts";
import { PublicCollector } from "./host/public-collection.ts";

export default function toolDisplay(pi: ExtensionAPI): void {
  pi.registerMessageRenderer(noticeType, createNoticeRenderer());
  const warnings: string[] = [];
  let notify: ((message: string) => void) | undefined;
  let fallback: PublicCollector | undefined;

  const warning = (message: string) => {
    if (notify) notify(message);
    else warnings.push(message);
  };

  const collection = new DisplayCollectors((type, data) => pi.appendEntry(type, data), warning);
  const dispose = installHostIntegration(collection, warning, (action) =>
    pi.events.emit(action.event, action.data)
  );
  pi.on("session_shutdown", () => {
    notify = undefined;
    dispose?.();
    collection.dispose();
    fallback?.dispose();
  });
  pi.on("session_start", (_event, context) => {
    notify = (message) => context.ui.notify(message, "warning");
    fallback?.dispose();
    fallback = collection.start(context.sessionManager)
      ? undefined
      : new PublicCollector(pi, context, warning);
    if (context.mode !== "tui") dispose?.();
    else if (!dispose)
      warnings.push(
        "pi-tool-display: private TUI display lookup unavailable; keeping original rendering."
      );
    warnings.splice(0).forEach(notify);
  });
  pi.on("message_start", (event) => fallback?.event(event));
  pi.on("message_update", (event) => fallback?.event(event));
  pi.on("message_end", (event) => fallback?.event(event));
  pi.on("tool_execution_start", (event) => fallback?.event(event));
  pi.on("tool_execution_end", (event) => fallback?.event(event));
  pi.on("turn_end", (event) => fallback?.event(event));
  pi.on("agent_end", (event) => fallback?.event(event));
  pi.on("agent_settled", (event) => fallback?.event(event));
}
