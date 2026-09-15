import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { highlightCodeBounded } from "@pi-mono/libs/tui/components/code-highlight";
import { renderTreeContinuation } from "@pi-mono/libs/tui/components/tree";
import { displayText } from "@pi-mono/libs/tui/terminal-text";
import { textPrefix, wrapRows } from "@pi-mono/libs/tui/text-budget";

import {
  isLive,
  type DisplayGroup,
  type HeadingVerbs,
  type InvocationPart,
  type Outcome,
  type ToolFamily
} from "../contracts.ts";
import { invocationParts, invocationPartText } from "../invocation.ts";
import { expansionHint, codeHighlightLimits, tree, styleParameters } from "./format.ts";
import { bodyWidth } from "./layout.ts";
import { callOutcome } from "./outcome.ts";
import type { PreparedCard } from "./types.ts";

const COMPACT_HEADING_CHARACTERS = 16 * 1024;
const COMPACT_HEADING_ROWS = 3;

type HeadingDetail = { text: string; truncated: boolean };

function formatParts(
  parts: readonly InvocationPart[],
  p: PreparedCard,
  style: (part: InvocationPart, text: string) => string
): HeadingDetail {
  let remaining = p.expanded ? Infinity : COMPACT_HEADING_CHARACTERS;
  let text = "";

  for (const part of parts) {
    const source = invocationPartText(part, p.context.cwd);
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

function headingContinuation(rows: readonly string[], p: PreparedCard): string[] {
  if (!rows.length) return [];

  return renderTreeContinuation(rows, {
    width: p.width,
    indent: 2,
    style: (text) => p.theme.fg("dim", text),
    hasChildren: p.hasBody
  });
}

function titleRows(title: string, detail: HeadingDetail, p: PreparedCard): string[] {
  if (
    p.adapter.family === "invocation" &&
    visibleWidth(title) + 1 + visibleWidth(detail.text) > p.width
  )
    return [
      truncateToWidth(title, p.width, "…"),
      ...headingContinuation(previewRows(wrapRows(detail.text, bodyWidth(p.width)), p, detail), p)
    ];
  const source = detail.text.split("\n");
  const first = wrapRows(source[0] ?? "", Math.max(1, p.width - visibleWidth(title) - 1));
  const rest = [
    ...first.slice(1),
    ...source.slice(1).flatMap((line) => wrapRows(line, bodyWidth(p.width)))
  ];
  const rows = [truncateToWidth(`${title}${first.length ? ` ${first[0]}` : ""}`, p.width, "")];
  rows.push(...headingContinuation(previewRows(rest, p, detail, COMPACT_HEADING_ROWS - 1), p));

  return rows;
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

function terminalStatus(
  outcome: Outcome
): { suffix: string; color: Parameters<Theme["fg"]>[0] } | undefined {
  switch (outcome) {
    case "failure":
      return { suffix: "failed", color: "error" };
    case "cancelled":
      return { suffix: "cancelled", color: "warning" };
    case "unavailable":
      return { suffix: "outcome unavailable", color: "muted" };
    case "success":
      return undefined;
  }
}

function groupHeading(group: DisplayGroup, p: PreparedCard, animationPhase: number): string[] {
  const first = group.members[0] === p.call;
  const active = first && group.members.some(isLive);
  const marker = active && animationPhase ? "◦" : "•";
  const rows = first
    ? [
        `${p.theme.fg(active ? "accent" : "dim", marker)} ${p.theme.fg("toolTitle", p.theme.bold(active ? "Exploring" : "Explored"))}`
      ]
    : [];

  if (first && !active) {
    const outcomes = group.members.map(callOutcome);
    const failed = outcomes.filter((outcome) => outcome === "failure").length;
    const cancelled = outcomes.filter((outcome) => outcome === "cancelled").length;
    const unavailable = outcomes.filter((outcome) => outcome === "unavailable").length;
    const summary = [
      failed ? p.theme.fg("error", `${failed} failed`) : "",
      cancelled ? p.theme.fg("warning", `${cancelled} cancelled`) : "",
      unavailable ? p.theme.fg("muted", `${unavailable} outcome unavailable`) : ""
    ]
      .filter(Boolean)
      .join(p.theme.fg("dim", ", "));

    if (summary) {
      const suffix = p.theme.fg("dim", " · ") + summary;
      if (visibleWidth(rows[0]! + suffix) <= p.width) rows[0] += suffix;
      else
        rows.push(
          ...renderTreeContinuation(wrapRows(summary, bodyWidth(p.width)), {
            width: p.width,
            indent: 2,
            style: (text) => p.theme.fg("dim", text),
            hasChildren: true
          })
        );
    }
  }

  // A call remains in its own Pi row: native images and mouse targets must not be
  // displaced behind later summaries. Even repeated reads retain their identity.
  const item = {
    rows: p.exploration.flatMap((entry) => {
      const detail = formatParts(entry.parts, p, (part, text) => {
        if (part.kind === "annotation") return p.theme.fg("dim", text);

        return p.theme.fg(part.kind === "pattern" ? "syntaxString" : "text", text);
      });

      const terminal = isLive(p.call!) ? undefined : terminalStatus(p.outcome);
      const label = terminal ? `${entry.label} ${terminal.suffix}` : entry.label;

      return previewRows(
        wrapRows(
          `${p.theme.fg(terminal?.color ?? "accent", label)} ${detail.text}`,
          bodyWidth(p.width)
        ),
        p,
        detail
      );
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
  color: Parameters<Theme["fg"]>[0];
  pending: boolean;
} {
  const current = phase(p);
  const pending = ["preparing", "queued", "executing"].includes(current);
  const actionVerbs = p.headingVerbs ?? verbs[p.adapter.family];
  if (pending) return { verb: actionVerbs.pending, color: "accent", pending };
  const terminal = terminalStatus(p.outcome);
  if (terminal)
    return { verb: `${actionVerbs.action} ${terminal.suffix}`, color: terminal.color, pending };
  let verb = actionVerbs.complete;
  if (
    p.adapter.family === "write" &&
    p.call?.change?.change === "creation" &&
    p.call.operation?.outcome === "success"
  )
    verb = "Added";
  const quiet = ["read", "search", "list"].includes(p.adapter.family);

  return { verb, color: quiet ? "dim" : "success", pending };
}

function invocation(p: PreparedCard): HeadingDetail {
  const mcp = p.mcp;
  const name = mcp ? displayText(`${mcp.server}.${mcp.tool}`) : p.name;
  const parts =
    p.invocation ??
    (p.adapter.family === "invocation" && !p.showParameters
      ? [{ kind: "value" as const, text: name }]
      : invocationParts(name, p.context.args, p.adapter.family));

  return formatParts(
    parts.filter((part) => part.kind !== "parameters" || p.showParameters),
    p,
    (part, text) => {
      if (part.kind === "annotation") return p.theme.fg("dim", text);
      if (part.kind === "pattern") return p.theme.fg("syntaxString", text);
      if (part.kind === "parameters") return styleParameters(text, p.theme);
      if (p.adapter.family === "shell")
        return highlightCodeBounded(text, {
          ...codeHighlightLimits,
          language: p.name === "powershell" ? "powershell" : "bash"
        });

      return p.theme.fg(p.adapter.family === "invocation" ? "accent" : "text", text);
    }
  );
}

export function heading(p: PreparedCard, animationPhase: number): string[] {
  if (p.group && !p.expanded) return groupHeading(p.group, p, animationPhase);
  const state = status(p);
  const marker = state.pending && animationPhase ? "◦" : "•";
  const title = `${p.theme.fg(state.color, marker)} ${p.theme.fg("toolTitle", p.theme.bold(state.verb))}`;
  const rows = titleRows(title, invocation(p), p);
  if (p.showParameters && p.expanded && !["shell", "invocation"].includes(p.adapter.family))
    rows.push(
      ...headingContinuation(
        wrapRows(
          styleParameters(
            displayText(
              JSON.stringify(p.context.args === undefined ? {} : p.context.args, null, 2)
            ),
            p.theme
          ),
          bodyWidth(p.width)
        ),
        p
      )
    );

  return rows;
}
