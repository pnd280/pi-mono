import { formatDuration } from "@pi-mono/libs/tui/duration";
import { z } from "zod";

import type { ToolFamily } from "../../contracts.ts";
import type { SummaryItem, SummaryItemContext, ToolDisplayAdapter } from "../../contracts.ts";
import { writeCategory } from "../../run-summary.ts";
import {
  nativeFilePath,
  nativeInvocationParts,
  normalizeNativePathSpaces,
  pathSummaryItem
} from "./invocation.ts";
import { nativeReadAdapter } from "./read.ts";
import { nativeResultParts, nativeResultNotices } from "./result-presentation.ts";

const directoryArgsSchema = z.object({
  path: z.string().transform(normalizeNativePathSpaces).optional()
});
const searchArgsSchema = directoryArgsSchema.extend({ pattern: z.string() });

const nativeFamilies: Readonly<Record<string, ToolFamily>> = {
  read: "read",
  grep: "search",
  find: "search",
  ls: "list",
  bash: "shell",
  powershell: "shell",
  edit: "edit",
  write: "write"
};

/** Tool authors assert compatibility; this function does not verify native provenance. */
export function nativeAdapter(name: string): ToolDisplayAdapter | undefined {
  const family = Object.hasOwn(nativeFamilies, name) ? nativeFamilies[name] : undefined;
  if (!family) return undefined;
  if (family === "read") return nativeReadAdapter;

  // Commands and searches count every call via the family fallback; files and
  // directories count once by path.
  const summaryItems = (args: unknown, context: SummaryItemContext): SummaryItem[] | undefined => {
    if (family === "shell" || family === "search") return undefined;

    if (family === "list") {
      const list = directoryArgsSchema.safeParse(args);

      return list.success
        ? [pathSummaryItem(family, list.data.path || ".", context.cwd)]
        : undefined;
    }

    const path = nativeFilePath(args);
    const category = family === "write" ? writeCategory(context.change) : family;

    return path === undefined ? undefined : [pathSummaryItem(category, path, context.cwd)];
  };

  return {
    id: `pi:${name}`,
    family,
    invocation: (args) => nativeInvocationParts(name, args, family),
    summaryItems,
    savedOutput: family === "shell",
    patch: family === "edit",
    summary(_result, { operation, durationMs }) {
      if (family !== "shell" || !operation) return undefined;
      let status = `Operation ${operation.outcome} · exit unknown`;
      if (operation.timedOut) status = "Timed out";
      else if (operation.outcome === "cancelled") status = "Cancelled";
      else if (operation.exitCode !== undefined && operation.exitCode !== null)
        status = `Exit ${operation.exitCode}`;

      return {
        text: durationMs === undefined ? status : `${status} · ${formatDuration(durationMs)}`,
        // Exit status describes execution, not the command's answer.
        preserveOutput: true
      };
    },
    notices: (result) => nativeResultNotices(result.details),
    textParts: (text, args, context) => nativeResultParts(name, text, args, context),
    ...(family === "search" || family === "list"
      ? {
          exploration(args: unknown) {
            const directory = (
              family === "search" ? searchArgsSchema : directoryArgsSchema
            ).safeParse(args);
            if (!directory.success) return undefined;

            return [
              {
                parts: nativeInvocationParts(name, args, family),
                scope: { kind: "directory", value: directory.data.path || "." }
              }
            ];
          }
        }
      : {})
  };
}
