import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { selectionLabel } from "@pi-mono/utils/source-selection";
import { interpretReadResult } from "pi-read/result";

import type {
  BorrowedToolResult,
  InvocationPart,
  ResultTextPart,
  ToolDisplayAdapter
} from "../../contracts.ts";
import { pathSummaryItem } from "../../summary/items.ts";
import { nativeAdapter } from "../native/index.ts";
import { nativeInvocationParts, normalizeNativePathSpaces } from "../native/invocation.ts";
import { nativeResultParts } from "../native/result-presentation.ts";
import { argsSchema, parametersSchema, resultSchema } from "./schema.ts";

const native = nativeAdapter("read");
if (!native) throw new Error("Native read display adapter is unavailable.");

function supports(args: unknown, result: BorrowedToolResult): boolean {
  const input = argsSchema.safeParse(args);
  const output = resultSchema.safeParse(result);
  if (!input.success || !output.success) return false;
  const interpreted = interpretReadResult(result, input.data);

  return (
    interpreted.valid &&
    (interpreted.preview.kind === "absent" || input.data.selection !== undefined)
  );
}

function invocation(args: unknown): InvocationPart[] {
  const input = argsSchema.safeParse(args).data;
  const parts = nativeInvocationParts("read", input ?? args, "read");
  const selection = input?.selection;
  if (selection)
    parts.push({ kind: "annotation", text: ` · selection ${selectionLabel(selection)}` });

  return parts;
}

export const selectiveReadDisplayAdapter: ToolDisplayAdapter = {
  ...native,
  id: "pi-read:read",
  supports,
  invocation,
  summaryItems(args, { cwd }) {
    const path = argsSchema.safeParse(args).data?.path;

    // One read item per requested file; selections of one file count once.
    return path === undefined
      ? undefined
      : [pathSummaryItem("read", normalizeNativePathSpaces(path), cwd)];
  },
  exploration(args, result) {
    const input = argsSchema.safeParse(args);
    if (!input.success || (result && !supports(args, result))) return undefined;

    return [
      {
        parts: invocation(args),
        scope: { kind: "file", value: normalizeNativePathSpaces(input.data.path) }
      }
    ];
  },
  notices(result, expanded) {
    const interpreted = interpretReadResult(result);
    const source = { ...result, content: interpreted.sourceContent };

    return native.notices?.(source, expanded) ?? [];
  },
  textParts(text, args, context): ResultTextPart[] {
    const input = argsSchema.safeParse(args).data;
    if (!input || !resultSchema.safeParse(context.result).success)
      return [{ kind: context.isError ? "error" : "output", text }];
    const interpreted = interpretReadResult(context.result, input);
    if (!interpreted.valid || (interpreted.preview.kind === "valid" && !input.selection))
      return [{ kind: context.isError ? "error" : "output", text }];

    // Only the recorded appended block is a model preview. Source lookalikes remain source.
    if (
      interpreted.preview.kind === "valid" &&
      context.contentIndex === interpreted.preview.contentIndex
    )
      return [];
    const parts = nativeResultParts("read", text, input, context);
    const selection = input.selection;
    if (!selection || context.isError || context.isPartial || context.isCancelled) return parts;
    const block = interpreted.blocks[context.contentIndex];
    if (!block) return parts;

    return parts.map((part, index) => {
      // Native read diagnostics are separate parts, never source coordinates.
      if (index !== 0 || part.kind !== "output") return part;

      return {
        ...part,
        selection: block.highlight(part.text, selection)
      };
    });
  }
};

/** Select only the workspace extension's current read contract, never an arbitrary read override. */
export function piSelectiveReadAdapter(tool: ToolInfo | undefined): ToolDisplayAdapter | undefined {
  if (!tool || tool.name !== "read" || ["builtin", "sdk"].includes(tool.sourceInfo.source))
    return undefined;
  const path = tool.sourceInfo.path.replaceAll("\\", "/");
  const owned =
    /^npm:pi-read(?:@[^/]+)?$/.test(tool.sourceInfo.source) ||
    /(?:^|\/)pi-read\/(?:src\/)?index\.[cm]?[jt]s$/.test(path);

  return owned && parametersSchema.safeParse(tool.parameters).success
    ? selectiveReadDisplayAdapter
    : undefined;
}
