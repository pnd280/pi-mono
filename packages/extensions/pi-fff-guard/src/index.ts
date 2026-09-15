import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { fffAdapter } from "@pi-mono/utils/fff-tools";

import { evaluateSearch } from "./evaluate-search.ts";

export default function fffGuardExtension(pi: ExtensionAPI): void {
  // Temporary workaround: https://github.com/dmtrKovalenko/fff/issues/714
  // Discovery is deliberately per invocation: FFF registers during startup.
  pi.on("tool_call", async (event, ctx) => {
    const kind = fffAdapter(pi.getAllTools().find((tool) => tool.name === event.toolName));
    if (!kind) return;
    const decision = await evaluateSearch({
      kind,
      toolName: event.toolName,
      input: event.input,
      cwd: ctx.cwd,
      signal: ctx.signal
    });
    if (decision.kind === "block") return { block: true, reason: decision.reason };

    if (decision.diagnostic) {
      // OS errors can include terminal controls from file names.
      const text = displayText(
        `FFF ignored-path detection unavailable: ${decision.diagnostic}. Allowing the FFF call.`
      );
      if (ctx.hasUI) ctx.ui.notify(text, "warning");
      else console.error(text);
    }

    return undefined;
  });
}
