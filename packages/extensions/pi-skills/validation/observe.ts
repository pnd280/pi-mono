import { appendFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function observe(pi: ExtensionAPI): void {
  pi.on("input", (event, ctx) => {
    appendFileSync(
      join(ctx.cwd, "inputs.jsonl"),
      `${JSON.stringify({ ...event, mode: ctx.mode })}\n`
    );
    ctx.ui.notify(`Captured: ${JSON.stringify(event.text)}`, "info");

    // Stop before the agent: completion and expansion checks need no model request.
    return { action: "handled" };
  });

  pi.registerCommand("fixture", {
    description: "Check unrelated command completion",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Fixture command", "info");
    }
  });

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const item = { value: "#fixture", label: "#fixture" };
    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["#"],
      getSuggestions: async (lines, line, col, options) => {
        const prefix = lines[line]?.slice(0, col).match(/(?:^|\s)(#[^\s]*)$/u)?.[1];

        return prefix
          ? { prefix, items: [item] }
          : current.getSuggestions(lines, line, col, options);
      },
      applyCompletion: (lines, line, col, selected, prefix) =>
        current.applyCompletion(lines, line, col, selected, prefix),
      shouldTriggerFileCompletion: (lines, line, col) =>
        current.shouldTriggerFileCompletion?.(lines, line, col) ?? true
    }));
  });
}
