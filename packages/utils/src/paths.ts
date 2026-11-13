import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Expand only a leading standalone tilde or home separator; never consult the environment. */
export function expandHomePath(value: string, home: string): string {
  if (value === "~") return home;
  if (value.startsWith("~/") || (sep === "\\" && value.startsWith("~\\")))
    return join(home, value.slice(2));

  return value;
}

/**
 * Pi's Windows drive aliases from Git Bash, MSYS, Cygwin, and WSL: `/c/dir`, `/mnt/c/dir`, and `/cygdrive/c/dir` become `C:\dir`. Other values, including UNC and backslash paths, are unchanged.
 */
export function windowsDrivePath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return value;
  const match = /^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i.exec(value);
  if (!match?.[1]) return value;

  return `${match[1].toUpperCase()}:\\${match[2]?.replaceAll("/", "\\") ?? ""}`;
}

/** Display local paths relative to cwd and external paths absolutely, without filesystem access. */
export function relativeDisplayPath(value: string, cwd: string): string {
  const absolute = resolve(cwd, value);
  const local = containsPath(cwd, absolute) ? relative(cwd, absolute) || "." : absolute;

  return local.split(sep).join("/");
}

/** Lexical containment, including equality. Absolute inputs avoid consulting process.cwd(). This does not resolve symlinks and is not a filesystem access-control check. */
export function containsPath(parent: string, child: string): boolean {
  const local = relative(parent, child);

  return local === "" || (!isAbsolute(local) && local !== ".." && !local.startsWith(`..${sep}`));
}
