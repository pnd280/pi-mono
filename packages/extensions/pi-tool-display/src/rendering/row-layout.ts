import { truncateToWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import type { DisplayCall, DisplayGroup, DisplayRun, SummaryRole } from "../contracts.ts";
import { renderCollapseRow } from "./summary-line.ts";
import type { DisplayTheme } from "./types.ts";

/** Chrome is shared by Pi's transcript rows and public-component foreign rows. */
export type RowChrome =
  | { kind: "hidden" }
  | { kind: "summary"; line: readonly string[] }
  | {
      kind: "card";
      joined: boolean;
      imagePrefix: string;
      collapse: { top: boolean; bottom: boolean; rule: string } | undefined;
    };

export type RowTarget = { kind: "card"; y: number } | { kind: "collapse" };

export type RowLayout = { rows: string[]; targets: (RowTarget | undefined)[] };

interface RowView {
  group(call: DisplayCall): DisplayGroup | undefined;
  run(call: DisplayCall): DisplayRun | undefined;
  summaryRole(call: DisplayCall): SummaryRole | undefined;
  collapsible(call: DisplayCall): boolean;
}

/** Apply chrome to a margin, self-rendered content, and optional image rows. */
export function layoutRow(
  rows: readonly string[],
  selfHeight: number,
  chrome: RowChrome
): RowLayout {
  const layout: RowLayout = { rows: [], targets: [] };

  const push = (row: string, target?: RowTarget) => {
    layout.rows.push(row);
    layout.targets.push(target);
  };

  if (chrome.kind === "hidden") return layout;

  if (chrome.kind === "summary") {
    if (!chrome.line.length) return layout;
    push("");
    chrome.line.forEach((row, y) => push(row, { kind: "card", y }));

    return layout;
  }

  const self = selfHeight > 0 ? rows.slice(1, selfHeight + 1) : [];
  const images = rows.slice(selfHeight > 0 ? selfHeight + 1 : 0);
  const collapse = chrome.collapse;
  if (self.length && !chrome.joined) push("");

  if (collapse?.top) {
    push(collapse.rule, { kind: "collapse" });
    push("", { kind: "collapse" });
  }

  self.forEach((row, y) => push(row, { kind: "card", y }));
  images.forEach((row) => push(chrome.imagePrefix + row));

  if (collapse?.bottom) {
    push("", { kind: "collapse" });
    push(collapse.rule, { kind: "collapse" });
  }

  return layout;
}

export function rowChrome(
  call: DisplayCall,
  coordinator: RowView,
  width: number,
  theme: DisplayTheme | undefined,
  summaryLine: () => readonly string[],
  notice: boolean,
  tail: boolean
): RowChrome {
  const role = coordinator.summaryRole(call);
  if (role && (notice || role.kind === "hidden")) return { kind: "hidden" };
  if (role) return { kind: "summary", line: summaryLine() };
  const group = notice || call.expanded ? undefined : coordinator.group(call);
  const run = coordinator.run(call);
  const top = !notice && run?.members[0] === call;
  const bottom = tail && run?.members.at(-1) === call;
  const collapsible = (top || bottom) && theme !== undefined && coordinator.collapsible(call);
  let imagePrefix = "    ";
  if (group)
    imagePrefix = group.members.at(-1) !== call ? `  ${TUI_GLYPHS.tree.guide}   ` : "      ";

  return {
    kind: "card",
    joined: !!group && group.members[0] !== call,
    imagePrefix: truncateToWidth(
      theme ? theme.fg("dim", imagePrefix) : imagePrefix,
      Math.max(0, width - 1),
      ""
    ),
    collapse: collapsible ? { top, bottom, rule: renderCollapseRow({ width, theme }) } : undefined
  };
}
