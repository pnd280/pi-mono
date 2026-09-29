import {
  CustomMessageComponent,
  type ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DisplayCall } from "../contracts.ts";
import { renderCollapseRow, renderRunSummary } from "../rendering/summary-line.ts";
import type { DisplayTheme } from "../rendering/types.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { record } from "../values.ts";

/** What a row's chrome adds around, or instead of, Pi's rows. */
export type RowChrome =
  | { kind: "hidden" }
  | { kind: "summary"; line: readonly string[] }
  | {
      kind: "card";
      /** A collapsed group member after the first shares its predecessor's margin. */
      joined: boolean;
      /** Opened-run collapse controls: a rule and its inner padding row. */
      collapse: { top: boolean; bottom: boolean; rule: string } | undefined;
    };

/** `card.y` is the row's index among Pi's self-rendered rows. */
export type RowTarget = { kind: "card"; y: number } | { kind: "collapse" };

export type RowLayout = {
  rows: string[];
  /** One entry per row; margins and image rows have no target. */
  targets: (RowTarget | undefined)[];
};

/**
 * Pure: apply chrome to Pi 0.87.1's self-rendered row: a margin row and
 * `selfHeight` renderer rows when the renderers produced any, then image rows.
 */
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
    // Omitted runs occupy no rows, including margins.
    if (!chrome.line.length) return layout;
    // Summaries never render images; the line replaces the card.
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
  images.forEach((row) => push(row));

  if (collapse?.bottom) {
    push("", { kind: "collapse" });
    push(collapse.rule, { kind: "collapse" });
  }

  return layout;
}

type DisplayRow = ToolExecutionComponent | CustomMessageComponent;

/** A click the row itself consumed, targeted at the row. */
function handled(component: DisplayRow, event: TuiMouseEvent) {
  return {
    handled: true as const,
    target: {
      component,
      originX: event.screenX - event.x,
      originY: event.screenY - event.y,
      width: event.width,
      height: event.height
    }
  };
}

/** The chrome the transcript currently gives a call's row. */
function rowChrome(
  call: DisplayCall,
  coordinator: TranscriptCoordinator,
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

  return {
    kind: "card",
    joined: !!group && group.members[0] !== call,
    collapse: collapsible ? { top, bottom, rule: renderCollapseRow({ width, theme }) } : undefined
  };
}

/**
 * Own a Pi row's chrome and click routing: summary lines, hidden members, joined
 * group margins, and collapse controls. Card clicks the transcript does not handle
 * reach Pi's own row handlers at their original coordinates.
 */
export function bindRowChrome(
  row: DisplayRow,
  call: DisplayCall,
  coordinator: TranscriptCoordinator,
  options: {
    active: () => boolean;
    theme: () => DisplayTheme | undefined;
    /** Only the last notice after a call (or the call without notices) owns its footer. */
    tail?: () => boolean;
  }
): () => void {
  const hooks = new OwnedHooks();
  const notice = row instanceof CustomMessageComponent;
  // Retain Pi's unbound methods and rebind their original receiver when delegating.
  // oxlint-disable-next-line typescript/unbound-method
  const previousRender = row.render;
  // oxlint-disable-next-line typescript/unbound-method
  const previousMouse = row.handleMouse;
  // oxlint-disable-next-line typescript/unbound-method
  const previousInvalidate = row.invalidate;
  let targets: RowLayout["targets"] = [];
  let summary: { revision: number; width: number; line: string[] } | undefined;

  // The coordinator invalidates a leader when its run changes; Pi invalidates rows
  // on theme changes.
  const summaryLine = (width: number, theme: DisplayTheme | undefined) => {
    if (!theme) return [];

    if (summary?.revision !== call.revision || summary.width !== width) {
      const model = coordinator.summary(call);
      summary = {
        revision: call.revision,
        width,
        line: renderRunSummary(model, { width, theme })
      };
    }

    return summary.line;
  };

  const render: typeof row.render = function (this: DisplayRow, width) {
    if (!options.active() || width < 1) {
      targets = [];

      return previousRender.call(this, width);
    }

    const theme = options.theme();
    const chrome = rowChrome(
      call,
      coordinator,
      width,
      theme,
      () => summaryLine(width, theme),
      notice,
      options.tail?.() ?? true
    );
    // Summary chrome replaces the entire row. Do not prepare hidden cards or images.
    // For visible cards, Pi updates selfRenderHeight while rendering.
    const rows = chrome.kind === "card" ? previousRender.call(this, width) : [];
    // CustomMessageComponent is a one-row Spacer followed by our notice renderer.
    const height = notice ? Math.max(0, rows.length - 1) : record(this).selfRenderHeight;
    const layout = layoutRow(rows, typeof height === "number" ? height : 0, chrome);
    targets = layout.targets;

    return layout.rows;
  };

  const handleMouse: typeof row.handleMouse = function (this: DisplayRow, event) {
    if (!options.active()) return previousMouse.call(this, event);
    const target = targets[event.y];
    if (!target) return undefined;
    const click = event.type === "click" && event.button === "left";

    if (target.kind === "collapse")
      return click && coordinator.activate(call, "collapse") ? handled(this, event) : undefined;
    if (click && coordinator.activate(call, notice ? "notice" : "card"))
      return handled(this, event);
    // Pi subtracts its margin row before routing to the renderer slots.
    const local: TuiMouseEvent = { ...event, y: target.y + 1 };

    return previousMouse.call(this, local);
  };

  const invalidate: typeof row.invalidate = function (this: DisplayRow) {
    summary = undefined;
    previousInvalidate.call(this);
  };

  // Owned hooks unwind in reverse order: restore rendering before mouse routing.
  hooks.replace(row, "invalidate", invalidate);
  hooks.replace(row, "handleMouse", handleMouse);
  hooks.replace(row, "render", render);

  return () => {
    targets = [];
    summary = undefined;
    hooks.restore();
  };
}
