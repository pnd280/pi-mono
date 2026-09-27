import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import type { ChangeFact, SummaryCategory, SummaryItem, ToolFamily } from "../contracts.ts";

const OTHER_PREFIX = "other:";

const categories: readonly SummaryCategory[] = [
  { id: "create", count: { one: "created {n} file", other: "created {n} files" } },
  { id: "edit", count: { one: "edited {n} file", other: "edited {n} files" } },
  { id: "shell", count: { one: "ran {n} command", other: "ran {n} commands" } },
  { id: "mcp", count: { one: "{n} MCP call", other: "{n} MCP calls" } },
  { id: "search", count: { one: "{n} search", other: "{n} searches" } },
  { id: "list", count: { one: "listed {n} dir", other: "listed {n} dirs" } },
  { id: "read", count: { one: "read {n} file", other: "read {n} files" } }
];

export const builtinCategories: ReadonlyMap<string, SummaryCategory> = new Map(
  categories.map((category) => [category.id, category])
);

/** Uncategorized tools count per tool name. */
export function otherCategory(tool: string): SummaryCategory {
  const name = compactDisplayText(tool);

  return {
    id: `${OTHER_PREFIX}${tool}`,
    count: { one: `${name} ×{n}`, other: `${name} ×{n}` }
  };
}

/** Per-tool categories lead with a tool name, which is an identifier rather than a verb. */
export function isToolCategory(category: SummaryCategory): boolean {
  return category.id.startsWith(OTHER_PREFIX);
}

/** Built-in, then adapter-declared, then synthesized per-tool categories. */
export function resolveCategory(
  id: string,
  declared: ReadonlyMap<string, SummaryCategory>
): SummaryCategory {
  return (
    builtinCategories.get(id) ??
    declared.get(id) ??
    otherCategory(id.startsWith(OTHER_PREFIX) ? id.slice(OTHER_PREFIX.length) : id)
  );
}

/** Adapters without summary items count each call once in their family's category. */
export function fallbackItems(
  family: ToolFamily,
  tool: string,
  change: ChangeFact | undefined
): SummaryItem[] {
  switch (family) {
    case "read":
    case "search":
    case "list":
    case "shell":
    case "edit":
      return [{ category: family }];
    case "write":
      return [{ category: writeCategory(change) }];
    case "invocation":
      return [{ category: `${OTHER_PREFIX}${tool}` }];
  }
}

/** Observed creation counts as created; modifications and unknown history count as edits. */
export function writeCategory(change: ChangeFact | undefined): "create" | "edit" {
  return change?.change === "creation" ? "create" : "edit";
}
