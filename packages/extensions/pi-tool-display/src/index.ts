import { SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerBuiltinDisplays } from "./builtins.ts";
import { installReplayDisplays } from "./replay.ts";

export default function toolDisplay(pi: ExtensionAPI): void {
  const disposeReplay = installReplayDisplays();
  pi.on("session_shutdown", () => {
    disposeReplay?.();
  });
  pi.on("session_start", (_event, context) => {
    if (context.mode !== "tui") {
      disposeReplay?.();
      return;
    }
    if (!disposeReplay) {
      context.ui.notify(
        "pi-tool-display: transcript replay hook unavailable; /reload may restore default displays.",
        "warning",
      );
    }
    // Mirror the CLI's execution settings without reading untrusted project overrides.
    const settings = SettingsManager.create(context.cwd, undefined, {
      projectTrusted: context.isProjectTrusted(),
    });
    if (settings.drainErrors().length > 0) {
      context.ui.notify(
        "pi-tool-display: could not read execution settings; keeping original tools.",
        "warning",
      );
      return;
    }
    registerBuiltinDisplays(pi, context.cwd, settings);
  });
}
