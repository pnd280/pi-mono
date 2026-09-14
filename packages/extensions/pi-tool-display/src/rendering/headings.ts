import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { isLive, isCancelled, type DisplayGroup, type ToolFamily } from "../contracts.ts";
import { invocationParts, invocationPartText } from "../invocation.ts";
import { displayText } from "../terminal-text.ts";
import { expansionHint, highlight, tree, styleParameters } from "./format.ts";
import { bodyWidth, renderTreeContinuation, wrapRows } from "./layout.ts";
import type { PreparedCard } from "./types.ts";

function headingContinuation(rows: readonly string[], p: PreparedCard): string[] {
  if (!rows.length) return [];

  return renderTreeContinuation(rows, p.width, (text) => p.theme.fg("dim", text), p.hasBody);
}

function titleRows(title: string, detail: string, p: PreparedCard): string[] {
  if (p.adapter.family === "invocation" && visibleWidth(title) + 1 + visibleWidth(detail) > p.width)
    return [
      truncateToWidth(title, p.width, "…"),
      ...headingContinuation(wrapRows(detail, bodyWidth(p.width)), p)
    ];
  const source = detail.split("\n");
  const first = wrapRows(source[0] ?? "", Math.max(1, p.width - visibleWidth(title) - 1));
  const rest = [
    ...first.slice(1),
    ...source.slice(1).flatMap((line) => wrapRows(line, bodyWidth(p.width)))
  ];
  const rows = [truncateToWidth(`${title}${first.length ? ` ${first[0]}` : ""}`, p.width, "")];
  const continuation = p.expanded ? rest : rest.slice(0, 2);
  if (!p.expanded && rest.length > 2)
    continuation.push(
      truncateToWidth(
        p.theme.fg("dim", `… ${rest.length - 2} more rows (${expansionHint()})`),
        bodyWidth(p.width),
        "…"
      )
    );
  rows.push(...headingContinuation(continuation, p));

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

function groupHeading(group: DisplayGroup, p: PreparedCard): string[] {
  const first = group.members[0] === p.call;
  const active = first && group.members.some(isLive);
  const marker = active && p.phase ? "◦" : "•";
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
    rows: p.exploration.flatMap((entry) =>
      wrapRows(
        `${p.theme.fg("accent", entry.label)} ${entry.parts
          .map((part) =>
            p.theme.fg(
              part.kind === "annotation"
                ? "dim"
                : part.kind === "pattern"
                  ? "syntaxString"
                  : "text",
              invocationPartText(part, p.context.cwd)
            )
          )
          .join("")}`,
        bodyWidth(p.width)
      )
    )
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

function invocation(p: PreparedCard): string {
  const mcp = p.mcp;
  const name = mcp ? displayText(`${mcp.server}.${mcp.tool}`) : p.name;
  const parts = p.invocation;
  if (!parts && p.adapter.family === "invocation" && !p.showParameters)
    return p.theme.fg("accent", name);

  return (parts ?? invocationParts(name, p.context.args, p.adapter.family))
    .filter((part) => part.kind !== "parameters" || p.showParameters)
    .map((part) => {
      const text = invocationPartText(part, p.context.cwd);
      if (part.kind === "annotation") return p.theme.fg("dim", text);
      if (part.kind === "pattern") return p.theme.fg("syntaxString", text);
      if (part.kind === "parameters") return styleParameters(text, p.theme);
      if (p.adapter.family === "shell")
        return highlight(text, "", p.name === "powershell" ? "powershell" : "bash");

      return p.theme.fg(p.adapter.family === "invocation" ? "accent" : "text", text);
    })
    .join("");
}

export function heading(p: PreparedCard): string[] {
  if (p.group && !p.expanded) return groupHeading(p.group, p);
  const state = status(p);
  const typedOutcome = p.mcp?.outcome;

  if (typedOutcome === "transport-error" || typedOutcome === "returned-error")
    state.color = "error";
  else if (typedOutcome === "unavailable" && !state.pending) {
    state.color = "warning";
    state.verb = "Outcome unavailable";
  }

  const marker = state.pending && p.phase ? "◦" : "•";
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
