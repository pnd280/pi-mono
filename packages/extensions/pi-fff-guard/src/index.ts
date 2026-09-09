import type { ExtensionAPI, ToolInfo } from "@earendil-works/pi-coding-agent";

import { detectIgnored } from "./git-ignore.ts";
import { blockingReason, missingPathReason } from "./redirect.ts";
import { extractScope, type SearchInput, type SearchKind } from "./targets.ts";

const adapters: ReadonlyMap<string, SearchKind> = new Map([
  ["fffind", "find"],
  ["ffgrep", "grep"],
  ["fff-multi-grep", "multi"],
  ["find", "find"],
  ["grep", "grep"],
  ["multi_grep", "multi"]
]);

export function fffAdapter(
  tool: Pick<ToolInfo, "name" | "sourceInfo"> | undefined
): SearchKind | undefined {
  if (!tool) return undefined;
  const { sourceInfo } = tool;
  if (sourceInfo.source === "builtin" || sourceInfo.source === "sdk") return undefined;
  const owned =
    /^npm:@ff-labs\/pi-fff(?:@[^/]+)?$/.test(sourceInfo.source) ||
    /(?:^|\/)@ff-labs\/pi-fff\/(?:src\/)?index\.[cm]?[jt]s$/.test(
      sourceInfo.path.replaceAll("\\", "/")
    );
  return owned ? adapters.get(tool.name) : undefined;
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
      const input = event.input as SearchInput;
      const scope = await extractScope(kind, input, ctx.cwd, signal);
      signal.throwIfAborted();
      if (scope.missingPath) return { block: true, reason: missingPathReason() };
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
            reason: blockingReason(event.toolName)
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
