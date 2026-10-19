import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { z } from "zod";

export const absolutePathSchema = z.string().refine(isAbsolute, "Expected an absolute path");

/** Expand only a leading standalone tilde or home separator; never consult the environment. */
export function expandHomePath(value: string, home: string): string {
  if (!absolutePathSchema.safeParse(home).success)
    throw new TypeError("Home expansion requires an absolute home path.");
  if (value === "~") return home;
  if (value.startsWith("~/") || (sep === "\\" && value.startsWith("~\\")))
    return join(home, value.slice(2));

  return value;
}

/** Display local paths relative to cwd and external paths absolutely, without filesystem access. */
export function relativeDisplayPath(value: string, cwd: string): string {
  if (!absolutePathSchema.safeParse(cwd).success)
    throw new TypeError("Path display requires an absolute working directory.");
  const absolute = resolve(cwd, value);
  const local = containsPath(cwd, absolute) ? relative(cwd, absolute) || "." : absolute;

  return local.split(sep).join("/");
}

/** Lexical containment, including equality. Absolute inputs avoid consulting process.cwd().
 * This does not resolve symlinks and is not a filesystem access-control check.
 */
export function containsPath(parent: string, child: string): boolean {
  if (!absolutePathSchema.safeParse(parent).success || !absolutePathSchema.safeParse(child).success)
    throw new TypeError("Path containment requires absolute paths.");
  const local = relative(parent, child);

  return local === "" || (!isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`));
}
