import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { highlightCodeBounded } from "@pi-mono/libs/tui/components/code-highlight";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";
import { compactDisplayText, displayText } from "@pi-mono/libs/tui/terminal-text";
import { textPrefix, wrapRows } from "@pi-mono/libs/tui/text-budget";

import {
  isLive,
  type DisplayCall,
  type DisplayGroup,
  type HeadingVerbs,
  type InvocationPart,
  type Outcome,
  type ToolFamily
} from "../contracts.ts";
import { invocationParts, invocationPartText, serializeParameters } from "../invocation.ts";
import { expansionHint, codeHighlightLimits, tree, styleParameters } from "./format.ts";
import { bodyWidth } from "./layout.ts";
import { targetRows } from "./target-layout.ts";
import type { PreparedCard } from "./types.ts";

const COMPACT_HEADING_CHARACTERS = 16 * 1024;
const COMPACT_HEADING_ROWS = 3;

type HeadingColor = Parameters<Theme["fg"]>[0];

type ActionTone = "neutral" | "pending" | "error" | "unavailable";

type HeadingDetail = { text: string; truncated: boolean };

function formatParts(
  parts: readonly InvocationPart[],
  p: PreparedCard,
  style: (part: InvocationPart, text: string) => string,
  relativeTo = p.context.cwd
): HeadingDetail {
  let remaining = p.expanded ? Infinity : COMPACT_HEADING_CHARACTERS;
  let text = "";

  for (const part of parts) {
    const source = invocationPartText(part, p.context.cwd, relativeTo);
    const prefix = textPrefix(source, remaining);
    if (prefix) text += style(part, prefix);
    if (prefix.length < source.length) return { text, truncated: true };
    remaining -= prefix.length;
  }

  return { text, truncated: false };
}

function previewRows(
  rows: string[],
  p: PreparedCard,
  detail: HeadingDetail,
  maximum = COMPACT_HEADING_ROWS
): string[] {
  if (p.expanded) return rows;
  const retained = rows.slice(0, maximum);
  if (detail.truncated || rows.length > maximum)
    retained.push(
      truncateToWidth(
        p.theme.fg(
          "dim",
          `… ${detail.truncated ? "more details" : `${rows.length - maximum} more rows`} (${expansionHint()})`
        ),
        bodyWidth(p.width),
        "…"
      )
    );

  return retained;
}

function headingContinuation(
  rows: readonly string[],
  p: PreparedCard,
  hasChildren?: boolean
): string[] {
  if (!rows.length) return [];

  return renderTreeContinuation(rows, {
    width: p.width,
    indent: 2,
    style: (text) => p.theme.fg("dim", text),
    hasChildren: hasChildren ?? p.hasBody
  });
}

function titleRows(
  title: string,
  detail: HeadingDetail,
  p: PreparedCard,
  hasChildren?: boolean
): string[] {
  if (
    p.adapter.family === "invocation" &&
    visibleWidth(title) + 1 + visibleWidth(detail.text) > p.width
  )
    return [
      truncateToWidth(title, p.width, "…"),
      ...headingContinuation(
        previewRows(wrapRows(detail.text, bodyWidth(p.width)), p, detail),
        p,
        hasChildren
      )
    ];
  const source = detail.text.split("\n");
  const first = wrapRows(source[0] ?? "", Math.max(1, p.width - visibleWidth(title) - 1));
  const rest = [
    ...first.slice(1),
    ...source.slice(1).flatMap((line) => wrapRows(line, bodyWidth(p.width)))
  ];
  const rows = [truncateToWidth(`${title}${first.length ? ` ${first[0]}` : ""}`, p.width, "")];
  rows.push(
    ...headingContinuation(previewRows(rest, p, detail, COMPACT_HEADING_ROWS - 1), p, hasChildren)
  );

  return rows;
}

function targetTitleRows(
  title: string,
  parts: readonly InvocationPart[],
  p: PreparedCard,
  hasChildren?: boolean
): string[] | undefined {
  const indent = visibleWidth(title) + 1;
  const rows = targetRows(parts, {
    width: p.width - indent,
    cwd: p.context.cwd,
    theme: p.theme,
    expanded: p.expanded
  });
  if (!rows) return undefined;

  return [
    `${title}${rows.length ? ` ${rows[0]}` : ""}`,
    ...headingContinuation(
      rows.slice(1).map((row) => " ".repeat(Math.max(0, indent - 4)) + row),
      p,
      hasChildren
    )
  ];
}

const verbs: Record<ToolFamily, HeadingVerbs> = {
  read: { action: "Read", pending: "Reading", complete: "Read" },
  search: { action: "Search", pending: "Searching", complete: "Searched" },
  list: { action: "List", pending: "Listing", complete: "Listed" },
  shell: { action: "Run", pending: "Running", complete: "Ran" },
  edit: { action: "Edit", pending: "Editing", complete: "Edited" },
  write: { action: "Write", pending: "Writing", complete: "Wrote" },
  invocation: { action: "Call", pending: "Calling", complete: "Called" }
};

function terminalStatus(outcome: Outcome): { suffix: string; color: HeadingColor } | undefined {
  switch (outcome) {
    case "failure":
      return { suffix: "failed", color: "error" };
    case "cancelled":
      return { suffix: "cancelled", color: "error" };
    case "unavailable":
      return { suffix: "outcome unavailable", color: "muted" };
    case "success":
      return undefined;
  }
}

function actionTone(pending: boolean, outcome: Outcome): ActionTone {
  if (pending) return "pending";

  switch (outcome) {
    case "failure":
    case "cancelled":
      return "error";
    case "unavailable":
      return "unavailable";
    case "success":
      return "neutral";
  }
}

function actionColor(tone: ActionTone): HeadingColor {
  switch (tone) {
    case "pending":
      return "warning";
    case "error":
      return "error";
    case "unavailable":
      return "muted";
    case "neutral":
      return "accent";
  }
}

function callActionTone(call: DisplayCall, p: PreparedCard): ActionTone {
  if (isLive(call)) return "pending";

  return actionTone(false, p.interpret(call).outcome);
}

function groupActionColor(group: DisplayGroup, p: PreparedCard): HeadingColor {
  const first = group.members[0];
  if (!first) return "accent";

  const tone = callActionTone(first, p);

  return group.members.every((call) => callActionTone(call, p) === tone)
    ? actionColor(tone)
    : "accent";
}

function scopeHeading(
  group: DisplayGroup,
  p: PreparedCard,
  title: string,
  outcome: string
): string[] {
  const parts: InvocationPart[] = [
    { kind: group.scope.kind === "filter" ? "value" : "path", text: group.scope.value }
  ];
  const detail = formatParts(parts, p, (_part, text) => p.theme.fg("text", text));
  const rows = targetTitleRows(title, parts, p, true) ?? titleRows(title, detail, p, true);
  if (!outcome) return rows;
  const suffix = p.theme.fg("dim", " · ") + outcome;

  const first = rows[0];

  if (rows.length === 1 && first !== undefined && visibleWidth(first + suffix) <= p.width) {
    rows[0] = first + suffix;

    return rows;
  }

  // Keep the failure badge with the action, moving the full scope below when
  // necessary instead of turning the badge into a separate metadata row.
  const scope =
    targetRows(parts, {
      width: bodyWidth(p.width),
      cwd: p.context.cwd,
      theme: p.theme,
      expanded: p.expanded
    }) ?? previewRows(wrapRows(detail.text, bodyWidth(p.width)), p, detail);

  return [...wrapRows(title + suffix, p.width), ...headingContinuation(scope, p, true)];
}

function explorationVerbs(p: PreparedCard): HeadingVerbs {
  const source = p.headingVerbs ?? verbs[p.adapter.family];

  const plain = (verb: string) => {
    const text = compactDisplayText(verb);
    const separator = text.lastIndexOf(" · ");

    return separator < 0 ? text : text.slice(separator + 3);
  };

  return {
    action: plain(source.action),
    pending: plain(source.pending),
    complete: plain(source.complete)
  };
}

function groupMemberLabel(p: PreparedCard): string {
  const actionVerbs = explorationVerbs(p);

  if (p.call && isLive(p.call)) return actionVerbs.pending;

  if (p.outcome === "success") return actionVerbs.complete;

  return actionVerbs.action;
}

function groupHeading(group: DisplayGroup, p: PreparedCard, animationPhase: number): string[] {
  const first = group.members[0] === p.call;
  const active = first && group.members.some(isLive);
  const marker = active && animationPhase ? TUI_GLYPHS.activeBullet : TUI_GLYPHS.bullet;
  const rows: string[] = [];

  if (first) {
    const outcomes = group.members
      .filter((call) => !isLive(call))
      .map((call) => p.interpret(call).outcome);
    const failed = outcomes.filter((outcome) => outcome === "failure").length;
    const cancelled = outcomes.filter((outcome) => outcome === "cancelled").length;
    const unavailable = outcomes.filter((outcome) => outcome === "unavailable").length;
    const summary = [
      failed ? p.theme.fg("error", `${failed} failed`) : "",
      cancelled ? p.theme.fg("error", `${cancelled} cancelled`) : "",
      unavailable ? p.theme.fg("muted", `${unavailable} outcome unavailable`) : ""
    ]
      .filter(Boolean)
      .join(p.theme.fg("dim", ", "));
    const titleColor = groupActionColor(group, p);

    if (group.title !== undefined) {
      // Adapter-defined groups use a title instead of exposing their literal scope.
      const badge = summary ? `${p.theme.fg("dim", " · ")}${summary}` : "";

      rows.push(
        ...wrapRows(
          `${p.theme.fg(titleColor, marker)} ${p.theme.fg(titleColor, p.theme.bold(compactDisplayText(group.title)))}${badge}`,
          p.width
        )
      );
    } else {
      const scopeVerbs =
        group.scope.kind === "filter"
          ? { pending: "Filtering", complete: "Filtered" }
          : { pending: "Exploring", complete: "Explored" };
      const title = `${p.theme.fg(titleColor, marker)} ${p.theme.fg(titleColor, p.theme.bold(active ? scopeVerbs.pending : scopeVerbs.complete))}`;

      rows.push(...scopeHeading(group, p, title, summary));
    }
  }

  // A call remains in its own Pi row: native images and mouse targets must not be
  // displaced behind later summaries. Even repeated reads retain their identity.
  const relativeTo = group.scope.kind === "directory" ? group.scope.value : p.context.cwd;
  const item = {
    rows: p.exploration.flatMap((entry) => {
      const detail = formatParts(
        entry.parts,
        p,
        (part, text) => {
          if (part.kind === "annotation" || part.kind === "range") return p.theme.fg("dim", text);

          return p.theme.fg(part.kind === "pattern" ? "syntaxString" : "text", text);
        },
        relativeTo
      );

      const terminal = p.call && isLive(p.call) ? undefined : terminalStatus(p.outcome);
      const lifecycle = p.call?.lifecycle;
      let label = groupMemberLabel(p);
      let annotation = "";
      if (terminal) label += ` ${terminal.suffix}`;
      else if (lifecycle === "executing") annotation = " (running)";
      else if (lifecycle === "queued") annotation = " (queued)";

      const title =
        p.theme.fg(terminal?.color ?? "accent", label) +
        (annotation ? p.theme.fg("dim", annotation) : "");
      const indent = visibleWidth(title) + 1;
      const target = targetRows(entry.parts, {
        width: bodyWidth(p.width) - indent,
        cwd: p.context.cwd,
        relativeTo,
        theme: p.theme,
        expanded: p.expanded
      });
      if (target)
        return [
          `${title} ${target[0] ?? ""}`,
          ...target.slice(1).map((row) => " ".repeat(indent) + row)
        ];

      return previewRows(wrapRows(`${title} ${detail.text}`, bodyWidth(p.width)), p, detail);
    })
  };
  item.rows.push(...p.groupRows.map((row) => `  ${row}`));
  rows.push(...tree([item], p, group.members.at(-1) !== p.call));

  return rows;
}

function phase(p: PreparedCard): string {
  if (p.call) return p.call.lifecycle;
  if (!p.context.isPartial) return "complete";
  if (!p.context.argsComplete) return "preparing";

  return p.context.executionStarted ? "executing" : "queued";
}

function status(p: PreparedCard): {
  verb: string;
  actionColor: HeadingColor;
  pending: boolean;
} {
  const current = phase(p);
  const pending = ["preparing", "queued", "executing"].includes(current);
  const actionVerbs = p.headingVerbs ?? verbs[p.adapter.family];
  const tone = pending ? "pending" : actionTone(false, p.outcome);
  if (pending)
    return {
      verb: compactDisplayText(actionVerbs.pending),
      actionColor: actionColor(tone),
      pending
    };
  const terminal = terminalStatus(p.outcome);
  if (terminal)
    return {
      verb: `${compactDisplayText(actionVerbs.action)} ${terminal.suffix}`,
      actionColor: actionColor(tone),
      pending
    };
  let verb = compactDisplayText(actionVerbs.complete);
  if (
    p.adapter.family === "write" &&
    p.call?.change?.change === "creation" &&
    p.call.operation?.outcome === "success"
  )
    verb = "Added";

  return {
    verb,
    actionColor: actionColor(tone),
    pending
  };
}

function invocation(p: PreparedCard): { parts: InvocationPart[]; detail: HeadingDetail } {
  const mcp = p.mcp;
  const name = mcp ? displayText(`${mcp.server}.${mcp.tool}`) : p.name;
  const parts =
    p.invocation ??
    (p.adapter.family === "invocation" && !p.showParameters
      ? [{ kind: "value" as const, text: name }]
      : invocationParts(name, p.context.args, p.adapter.family));

  const visible = parts.filter((part) => part.kind !== "parameters" || p.showParameters);
  const detail = formatParts(visible, p, (part, text) => {
    if (part.kind === "annotation" || part.kind === "range") return p.theme.fg("dim", text);
    if (part.kind === "pattern") return p.theme.fg("syntaxString", text);
    if (part.kind === "parameters") return styleParameters(text, p.theme);
    if (p.adapter.family === "shell")
      return highlightCodeBounded(text, {
        ...codeHighlightLimits,
        language: p.name === "powershell" ? "powershell" : "bash"
      });

    return p.theme.fg(p.adapter.family === "invocation" ? "accent" : "text", text);
  });

  return { parts: visible, detail };
}

export function heading(p: PreparedCard, animationPhase: number): string[] {
  if (p.group && !p.expanded) return groupHeading(p.group, p, animationPhase);
  const state = status(p);
  const marker = state.pending && animationPhase ? TUI_GLYPHS.activeBullet : TUI_GLYPHS.bullet;
  const title = `${p.theme.fg(state.actionColor, marker)} ${p.theme.fg(state.actionColor, p.theme.bold(state.verb))}`;
  const { parts, detail } = invocation(p);
  const rows = targetTitleRows(title, parts, p) ?? titleRows(title, detail, p);
  if (p.showParameters && p.expanded && !["shell", "invocation"].includes(p.adapter.family))
    rows.push(
      ...headingContinuation(
        wrapRows(
          styleParameters(
            displayText(serializeParameters(p.context.args === undefined ? {} : p.context.args, 2)),
            p.theme
          ),
          bodyWidth(p.width)
        ),
        p
      )
    );

  return rows;
}
