import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installHostIntegration } from "./host-integration.ts";

export default function toolDisplay(pi: ExtensionAPI): void {
  const warnings: string[] = [];
  let notify: ((message: string) => void) | undefined;
  const dispose = installHostIntegration(
    (type, data) => pi.appendEntry(type, data),
    (message) => {
      if (notify) notify(message);
      else warnings.push(message);
    }
  );
  pi.on("session_shutdown", () => {
    notify = undefined;
    dispose?.();
  });
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui") {
      dispose?.();
      return;
    }
    notify = (message) => context.ui.notify(message, "warning");
    if (!dispose)
      warnings.push(
        "pi-tool-display: private TUI display lookup unavailable; keeping original rendering."
      );
    warnings.splice(0).forEach(notify);
  });
}
