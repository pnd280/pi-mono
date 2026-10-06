import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { fffAdapter } from "@pi-mono/utils/fff-tools";
import { z } from "zod";

import type { BorrowedToolResult, ToolDisplayAdapter } from "../contracts.ts";
import { fffDisplayAdapter } from "./@ff-labs/pi-fff/index.ts";
import { codemodeDisplayAdapter } from "./builtin/codemode/index.ts";
import { mcpToolDisplayAdapter } from "./builtin/mcp/index.ts";
import { toolSearchDisplayAdapter } from "./builtin/tool-search/index.ts";
import { genericAdapter } from "./generic.ts";
import { nativeAdapter } from "./native/index.ts";
import { mcpDisplayAdapter } from "./pi-mcp-adapter/index.ts";
import { selectiveReadDisplayAdapter } from "./pi-read/index.ts";
import {
  contextWindowDisplayAdapter,
  smartCompactDisplayAdapter
} from "./pi-smart-compact/index.ts";
import { subagentAbortDisplayAdapter, subagentDisplayAdapter } from "./pi-subagents/index.ts";
import { todoDisplayAdapter } from "./pi-todo/index.ts";

/** Bump when a recorded assertion can no longer be interpreted by these adapters. */
export const ADAPTER_CONTRACT_VERSION = 1;

const fixed = new Map<string, { name?: string; adapter: ToolDisplayAdapter }>([
  ["generic", { adapter: genericAdapter }],
  ["builtin:codemode", { name: "codemode", adapter: codemodeDisplayAdapter }],
  ["builtin:mcp", { adapter: mcpToolDisplayAdapter }],
  ["builtin:tool-search", { name: "tool_search", adapter: toolSearchDisplayAdapter }],
  ["pi-read:read", { name: "read", adapter: selectiveReadDisplayAdapter }],
  ["pi-smart-compact:compact", { name: "compact", adapter: smartCompactDisplayAdapter }],
  [
    "pi-smart-compact:context_window",
    { name: "context_window", adapter: contextWindowDisplayAdapter }
  ],
  ["pi-todo:todo", { name: "todo", adapter: todoDisplayAdapter }],
  ["pi-subagents:subagent", { name: "subagent", adapter: subagentDisplayAdapter }],
  ["pi-subagents:subagent_abort", { name: "subagent_abort", adapter: subagentAbortDisplayAdapter }]
]);

/** Only call after validating the producer record against its source assistant entry. */
export function recordedAdapter(
  id: string,
  version: number,
  name: string
): ToolDisplayAdapter | undefined {
  if (version !== ADAPTER_CONTRACT_VERSION) return;
  const known = fixed.get(id);
  if (known) return !known.name || known.name === name ? known.adapter : undefined;
  if (id === `pi:${name}`) return nativeAdapter(name);
  for (const kind of ["find", "grep", "multi"] as const)
    if (id === `@ff-labs/pi-fff:${kind}`) return fffDisplayAdapter(kind, name);
  for (const kind of ["direct", "namespace", "gateway", "script"] as const)
    if (id === `pi-mcp-adapter:${kind}`) return mcpDisplayAdapter(kind, name);

  return;
}

const pathArgs = z
  .object({ path: z.string().optional(), file_path: z.string().optional() })
  .refine((args) => !!(args.path || args.file_path));
const commandArgs = z.object({ command: z.string() });
const directoryArgs = z.object({ path: z.string().optional() });
const searchArgs = directoryArgs.extend({ pattern: z.string() });
const resultSchema = z.object({ content: z.array(z.object({ type: z.string() })) });

/** A producer's contract assertion must not contradict its recorded registering owner. */
export function supportsRecordedSource(
  id: string,
  name: string,
  source: Pick<ToolInfo["sourceInfo"], "source" | "path">
): boolean {
  if (id === "generic") return true;
  if (id.startsWith("pi:")) return source.source === "builtin";
  if (id.startsWith("builtin:")) return source.source === "builtin" && source.path === id;
  if (id.startsWith("@ff-labs/pi-fff:"))
    return id === `@ff-labs/pi-fff:${fffAdapter({ name, sourceInfo: source })}`;
  if (["builtin", "sdk"].includes(source.source)) return false;
  const owner = id.split(":")[0];
  if (
    !owner ||
    !["pi-read", "pi-todo", "pi-smart-compact", "pi-subagents", "pi-mcp-adapter"].includes(owner)
  )
    return false;
  const path = source.path.replaceAll("\\", "/");
  const packageSource = new RegExp(`^npm:${owner}(?:@[^/]+)?$`).test(source.source);

  return packageSource || new RegExp(`(?:^|/)${owner}/(?:src/)?index\\.[cm]?[jt]s$`).test(path);
}

function nativeArgs(name: string) {
  if (name === "bash" || name === "powershell") return commandArgs;
  if (name === "ls") return directoryArgs;
  if (name === "grep" || name === "find") return searchArgs;

  return pathArgs;
}

export function supportsRecordedCall(
  adapter: ToolDisplayAdapter,
  name: string,
  args: unknown,
  result?: BorrowedToolResult
): boolean {
  if (result && !resultSchema.safeParse(result).success) return false;
  if (adapter.id === `pi:${name}` && !nativeArgs(name).safeParse(args).success) return false;

  try {
    return !result || adapter.supports?.(args, result) !== false;
  } catch {
    return false;
  }
}
