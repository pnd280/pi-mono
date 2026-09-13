import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fffAdapter } from "@pi-mono/utils/fff-tools";

import { detectIgnored } from "./git-ignore.ts";
import { extractScope, type SearchInput } from "./targets.ts";

function parseSearchInput(input: Record<string, unknown>): SearchInput {
  const scope: SearchInput = {};

  for (const key of ["pattern", "path", "constraints"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new Error(`Invalid FFF ${key}: expected a string`);
    scope[key] = value;
  }

  const exclude = input.exclude;

  if (exclude !== undefined) {
    if (
      typeof exclude !== "string" &&
      !(Array.isArray(exclude) && exclude.every((entry: unknown) => typeof entry === "string"))
    )
      throw new Error("Invalid FFF exclude: expected a string or string array");
    scope.exclude = exclude;
  }

  return scope;
}

export default function fffGuardExtension(pi: ExtensionAPI): void {
  // Temporary workaround: https://github.com/dmtrKovalenko/fff/issues/714
  // Discovery is deliberately per invocation: FFF registers during startup.
  pi.on("tool_call", async (event, ctx) => {
    const kind = fffAdapter(pi.getAllTools().find((tool) => tool.name === event.toolName));
    if (!kind) return;
    const cancelled = {
      block: true,
      reason: "Ignored-path detection cancelled; no replacement search was started."
    };
    if (ctx.signal?.aborted) return cancelled;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, controller.signal])
      : controller.signal;

    const diagnostic = (message: string) => {
      const text = `FFF ignored-path detection unavailable: ${message}. Allowing the FFF call.`;
      if (ctx.hasUI) ctx.ui.notify(text, "warning");
      else console.error(text);
    };

    try {
      const input = parseSearchInput(event.input);
      const scope = await extractScope(kind, input, ctx.cwd, signal);
      signal.throwIfAborted();
      if (scope.missingPath) return { block: true, reason: "No such file or directory" };
      const inspected = new Set<string>();

      for (const target of scope.targets) {
        signal.throwIfAborted();
        if (inspected.has(target.absolute)) continue;
        inspected.add(target.absolute);
        const result = await detectIgnored(target.absolute, ctx.cwd, signal);
        if (ctx.signal?.aborted) return cancelled;
        if (result.status === "cancelled") throw new Error("inspection timed out");

        if (result.status === "unavailable") {
          diagnostic(result.diagnostic);

          return;
        }

        if (result.status === "ignored")
          return {
            block: true,
            reason: `${event.toolName} does not work with Git-ignored paths. Retry with rg or another available tool.`
          };
      }
    } catch (error) {
      if (ctx.signal?.aborted) return cancelled;
      diagnostic(
        controller.signal.aborted
          ? "inspection timed out"
          : error instanceof Error
            ? error.message.replace(/[\r\n]/g, " ").slice(0, 180)
            : "inspection failed"
      );
    } finally {
      clearTimeout(timeout);
    }

    return undefined;
  });
}
