import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import {
  isLive,
  isCancelled,
  type DisplayGroup,
  type InvocationPart,
  type ToolFamily
} from "../contracts.ts";
import { invocationParts, invocationPartText } from "../invocation.ts";
import { displayText } from "../terminal-text.ts";
import { expansionHint, highlight, tree, styleParameters } from "./format.ts";
import { bodyWidth, renderTreeContinuation, textPrefix, wrapRows } from "./layout.ts";
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

  return renderTreeContinuation(rows, p.width, (text) => p.theme.fg("dim", text), p.hasBody);
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

const verbs: Record<ToolFamily, [string, string]> = {
  read: ["Reading", "Read"],
  search: ["Searching", "Searched"],
  list: ["Listing", "Listed"],
  shell: ["Running", "Ran"],
  edit: ["Editing", "Edited"],
  write: ["Writing", "Wrote"],
  invocation: ["Calling", "Called"]
};

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
    const failed = group.members.filter(
      (member) => member.outcome === "failure" && !isCancelled(member)
    ).length;
    const cancelled = group.members.filter(isCancelled).length;
    const unavailable = group.members.filter((member) => member.outcome === "unavailable").length;
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
          ...renderTreeContinuation(
            wrapRows(summary, bodyWidth(p.width)),
            p.width,
            (text) => p.theme.fg("dim", text),
            true
          )
        );
    }
  }

  // A call remains in its own Pi row: native images and mouse targets must not be
  // displaced behind later summaries. Even repeated reads retain their identity.
  const item = {
    rows: p.exploration.flatMap((entry) => {
      const detail = formatParts(entry.parts, p, (part, text) =>
        p.theme.fg(
          part.kind === "annotation" ? "dim" : part.kind === "pattern" ? "syntaxString" : "text",
          text
        )
      );

      return previewRows(
        wrapRows(`${p.theme.fg("accent", entry.label)} ${detail.text}`, bodyWidth(p.width)),
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
  const failed = p.call ? p.call.outcome === "failure" : p.context.isError;
  const actionVerbs = p.headingVerbs ?? verbs[p.adapter.family];
  let verb = actionVerbs[pending ? 0 : 1];
  if (current === "unavailable") verb = "Outcome unavailable";
  if (p.call && isCancelled(p.call)) return { verb: "Cancelled", color: "warning", pending: false };
  if (
    p.adapter.family === "write" &&
    p.call?.change?.change === "creation" &&
    p.call.operation?.outcome === "success" &&
    !pending &&
    !failed
  )
    verb = "Added";
  if (pending) return { verb, color: "accent", pending };
  if (failed) return { verb, color: "error", pending };
  if (current === "unavailable") return { verb, color: "warning", pending };
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
        return highlight(text, "", p.name === "powershell" ? "powershell" : "bash");

      return p.theme.fg(p.adapter.family === "invocation" ? "accent" : "text", text);
    }
  );
}

export function heading(p: PreparedCard, animationPhase: number): string[] {
  if (p.group && !p.expanded) return groupHeading(p.group, p, animationPhase);
  const state = status(p);
  const typedOutcome = p.mcp?.outcome;

  if (typedOutcome === "transport-error" || typedOutcome === "returned-error")
    state.color = "error";
  else if (typedOutcome === "unavailable" && !state.pending) {
    state.color = "warning";
    state.verb = "Outcome unavailable";
  }

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
