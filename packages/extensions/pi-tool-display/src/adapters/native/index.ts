import { z } from "zod";

import type { ToolFamily } from "../../contracts.ts";
import type { SummaryItem, SummaryItemContext, ToolDisplayAdapter } from "../../contracts.ts";
import { writeCategory } from "../../summary/categories.ts";
import { pathSummaryItem } from "../../summary/items.ts";
import { nativeInvocationParts, normalizeNativePathSpaces } from "./invocation.ts";
import {
  nativeResultParts,
  nativeResultNotices,
  nativeReadNotices,
  nativeImageCaption
} from "./result-presentation.ts";

const readArgsSchema = z
  .object({ path: z.unknown().optional(), file_path: z.unknown().optional() })
  .transform((args) => args.path ?? args.file_path)
  .pipe(z.string().min(1).transform(normalizeNativePathSpaces));
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

    const path = readArgsSchema.safeParse(args).data;
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
    summary(_result, { operation }) {
      if (family !== "shell" || !operation) return undefined;
      let status = `Operation ${operation.outcome} · exit unknown`;
      if (operation.timedOut) status = "Timed out";
      else if (operation.outcome === "cancelled") status = "Cancelled";
      else if (operation.exitCode !== undefined && operation.exitCode !== null)
        status = `Exit ${operation.exitCode}`;

      return {
        text: `${status} · ${Math.round(operation.durationMs)}ms`,
        // Exit status describes execution, not the command's answer.
        preserveOutput: true
      };
    },
    notices: (result, expanded) => [
      ...nativeResultNotices(result.details),
      ...(name === "read" && !expanded ? nativeReadNotices(result) : [])
    ],
    textParts: (text, args, context) => nativeResultParts(name, text, args, context),
    ...(family === "read"
      ? { imageCaptionMimeType: (text: string) => nativeImageCaption(text)?.mimeType }
      : {}),
    ...(family === "read" || family === "search" || family === "list"
      ? {
          exploration(args: unknown) {
            const path = family === "read" ? readArgsSchema.safeParse(args).data : undefined;
            const directory = (
              family === "search" ? searchArgsSchema : directoryArgsSchema
            ).safeParse(args);
            if (family === "read" ? path === undefined : !directory.success) return undefined;

            return [
              {
                parts: nativeInvocationParts(name, args, family),
                scope:
                  path !== undefined
                    ? { kind: "file", value: path }
                    : { kind: "directory", value: directory.data?.path || "." }
              }
            ];
          }
        }
      : {})
  };
}
