export function hasGlob(value: string): boolean {
  return /[*?[{]/.test(value);
}

/** Finite brace alternatives only. Bound expansion, never enumerate the filesystem. */
export function alternatives(value: string): string[] {
  let expanded = [value];

  for (let depth = 0; depth < 8; depth++) {
    const next = expanded.flatMap((entry) => {
      // Skip comma-free groups such as `{1..4}` so later alternatives still expand.
      const match = /\{([^{},]*,[^{}]*)\}/.exec(entry);
      if (!match?.[1]) return [entry];

      return match[1]
        .split(",")
        .map(
          (part) => entry.slice(0, match.index) + part + entry.slice(match.index + match[0].length)
        );
    });
    if (next.length > 64) throw new Error("too many scope alternatives");
    if (next.join("\0") === expanded.join("\0")) return next;
    expanded = next;
  }

  throw new Error("scope alternatives are too deeply nested");
}

/** The static prefix before the first glob segment. */
export function globRoot(expression: string): string | undefined {
  const parts = expression.split("/");
  const boundary = parts.findIndex(hasGlob);
  if (boundary <= 0) return undefined;

  return parts.slice(0, boundary).join("/") || "/";
}
