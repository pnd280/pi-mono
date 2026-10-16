import { z } from "zod";

import type { InvocationPart, SummaryItem, ToolFamily } from "../../contracts.ts";
import { invocationParts, resolveInvocationPath } from "../../invocation.ts";

/** Pi 1.3.0 replaces these spaces before lexical path resolution. Its helper is
 * not publicly exported by coding-agent; keep this native policy out of custom paths and filters.
 */
export function normalizeNativePathSpaces(path: string): string {
  return path.replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, " ");
}

const filePathSchema = z
  .object({ path: z.unknown().optional(), file_path: z.unknown().optional() })
  .transform((args) => args.path ?? args.file_path)
  .pipe(z.string().min(1).transform(normalizeNativePathSpaces));

/** The file of a native read, edit, or write call. */
export function nativeFilePath(args: unknown): string | undefined {
  return filePathSchema.safeParse(args).data;
}

/** Files and directories are identified by their lexically resolved path, never by lookup. */
export function pathSummaryItem(
  category: string,
  path: string,
  cwd: string
): SummaryItem & { identity: string } {
  return { category, identity: `path\0${resolveInvocationPath(path, cwd) ?? path}` };
}

export function nativeInvocationParts(
  name: string,
  args: unknown,
  family: ToolFamily
): InvocationPart[] {
  return invocationParts(name, args, family).map((part) =>
    part.kind === "path" ? { ...part, text: normalizeNativePathSpaces(part.text) } : part
  );
}
