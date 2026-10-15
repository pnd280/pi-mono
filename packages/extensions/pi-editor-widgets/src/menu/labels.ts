import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

import type { Region } from "../layout.ts";
import type { View } from "./drafts.ts";

export const regionLabel: Record<Region, string> = {
  aboveEditor: "Above editor",
  belowEditor: "Below editor",
  footer: "Footer"
};

const builtinLabels: Record<string, string> = {
  "builtin:cwd": "Working directory",
  "builtin:git-branch": "Git branch",
  "builtin:session-title": "Session title",
  "builtin:tokens": "Tokens and cost",
  "builtin:context": "Context usage",
  "builtin:model": "Model and thinking",
  separator: "Separator",
  flex: "Flexible space"
};

export function itemLabel(id: string): string {
  return builtinLabels[id] ?? (compactDisplayText(id.slice(id.indexOf(":") + 1)) || "(unnamed)");
}

export function rowSummary(row: readonly string[]): string {
  return (
    row
      .map((id) => {
        if (id === "separator") return "•";
        if (id === "flex") return "↔";

        return itemLabel(id);
      })
      .join(" ") || "Empty row"
  );
}

export function viewTitle(view: View): string {
  if (view.kind === "root") return "Widgets";
  const region = regionLabel[view.region];
  if (view.kind === "rows") return `Widgets › ${region}`;

  return `Widgets › ${region} › Row ${view.row + 1}${view.kind === "picker" ? " › Add item" : ""}`;
}
