import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installBuiltinDisplays } from "./replay.ts";

export default function toolDisplay(pi: ExtensionAPI): void {
  const disposeDisplays = installBuiltinDisplays();
  pi.on("session_shutdown", () => {
    disposeDisplays?.();
  });
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui") {
      disposeDisplays?.();
      return;
    }
    if (!disposeDisplays) {
      context.ui.notify(
        "pi-tool-display: private TUI display lookup unavailable; keeping original rendering for live and restored tools.",
        "warning"
      );
    }
  });
}
