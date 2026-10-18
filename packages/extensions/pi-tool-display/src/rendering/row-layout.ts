import { truncateToWidth } from "@earendil-works/pi-tui";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import type { DisplayCall, DisplayGroup, DisplayRun, SummaryRole } from "../contracts.ts";
import { renderRunFooter } from "./summary-line.ts";
import type { DisplayTheme } from "./types.ts";

/** Chrome around one Pi transcript row. */
export type RowChrome =
  | { kind: "hidden" }
  | { kind: "summary"; line: readonly string[] }
  | {
      kind: "card";
      joined: boolean;
      imagePrefix: string;
      /** Collapse controls of an opened run: its summary line above, its end bar below. */
      header: readonly string[];
      footer: readonly string[];
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
  if (self.length && !chrome.joined) push("");

  if (chrome.header.length) {
    chrome.header.forEach((row) => push(row, { kind: "collapse" }));
    push("");
  }

  self.forEach((row, y) => push(row, { kind: "card", y }));
  images.forEach((row) => push(chrome.imagePrefix + row));

  if (chrome.footer.length) {
    push("");
    chrome.footer.forEach((row) => push(row, { kind: "collapse" }));
  }

  return layout;
}

const NO_CONTROLS = { header: [], footer: [] } as const;

/** An opened run's summary line stays above its first card; an end bar follows its last. */
function collapseControls(
  top: boolean,
  bottom: boolean,
  width: number,
  theme: DisplayTheme,
  summaryLine: (open: boolean) => readonly string[]
) {
  return {
    header: top ? summaryLine(true) : [],
    footer: bottom ? renderRunFooter(width, theme) : []
  };
}

export function rowChrome(
  call: DisplayCall,
  coordinator: RowView,
  width: number,
  theme: DisplayTheme | undefined,
  summaryLine: (open: boolean) => readonly string[],
  notice: boolean,
  tail: boolean
): RowChrome {
  const role = coordinator.summaryRole(call);
  if (role && (notice || role.kind === "hidden")) return { kind: "hidden" };
  if (role) return { kind: "summary", line: summaryLine(false) };
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
    ...(collapsible ? collapseControls(top, bottom, width, theme, summaryLine) : NO_CONTROLS)
  };
}
