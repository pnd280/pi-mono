import {
  getLanguageFromPath,
  highlightCode,
  keyText,
  type AgentToolResult,
  type Theme,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import {
  getCapabilities,
  MouseRegion,
  type Component,
  truncateToWidth,
  visibleWidth
} from "@earendil-works/pi-tui";

import { genericAdapter, type ToolDisplayAdapter, type McpFacts } from "./adapters.ts";
import { parsePatch } from "./diff.ts";
import { isLive, type DisplayCall, type DisplayGroup, type ToolFamily } from "./display-model.ts";
import {
  bodyWidth,
  compactRows,
  displayText,
  prefixRows,
  styledOutput,
  wrapRows
} from "./layout.ts";
import type { OutputText } from "./output-text.ts";
import {
  explorationSummary,
  invocationParts,
  record,
  resultNotices,
  stringField
} from "./presentation.ts";
import type { DisplayNotice, ResultTextPart } from "./result-presentation.ts";
import type { TranscriptCoordinator } from "./transcript-coordinator.ts";
export type { ToolFamily } from "./display-model.ts";
type DisplayTheme = Pick<Theme, "fg" | "bold">;
type HostContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];
type DisplayContext = Omit<HostContext, "args" | "state"> & { args: unknown; state: unknown };
export interface ToolDisplayRenderers {
  renderShell: "self";
  renderCall(args: unknown, theme: DisplayTheme, context: DisplayContext): Component;
  renderResult(
    result: AgentToolResult<unknown>,
    options: { expanded: boolean; isPartial: boolean },
    theme: DisplayTheme,
    context: DisplayContext
  ): Component;
}
export interface DisplayBinding {
  call: DisplayCall;
  coordinator: TranscriptCoordinator;
}
export interface ToolDisplayRendererOptions {
  /** Known adapters hide parameter details by default; generic calls always show arguments. */
  showParameters?: boolean;
  binding?: DisplayBinding;
}
interface Projection {
  name: string;
  adapter: ToolDisplayAdapter;
  context: DisplayContext;
  theme: DisplayTheme;
  width: number;
  expanded: boolean;
  showParameters: boolean;
  call: DisplayCall | undefined;
  result: AgentToolResult<unknown> | undefined;
  group: DisplayGroup | undefined;
  phase: number;
}
class DisplayComponent implements Component {
  private width: number | undefined;
  private rows: string[] | undefined;
  constructor(private project: (width: number) => string[]) {}
  update(project: (width: number) => string[]): void {
    this.project = project;
    this.invalidate();
  }
  render(width: number): string[] {
    if (width < 1) return [];
    if (this.width !== width || !this.rows) {
      this.width = width;
      this.rows = this.project(width).map((row) => truncateToWidth(row, width, ""));
    }
    return this.rows;
  }
  invalidate(): void {
    this.width = undefined;
    this.rows = undefined;
  }
}
const MAX_HIGHLIGHT_BYTES = 512 * 1024;
const expansionHint = () => `${keyText("app.tools.expand")} to expand`;
function component(
  context: DisplayContext,
  project: (width: number) => string[],
  binding?: DisplayBinding
): Component {
  if (!binding && context.lastComponent instanceof DisplayComponent) {
    context.lastComponent.update(project);
    return context.lastComponent;
  }
  const content = new DisplayComponent(project);
  return binding
    ? new MouseRegion(content, (event) => {
        if (
          event.type !== "click" ||
          event.button !== "left" ||
          !binding.coordinator.group(binding.call)
        )
          return undefined;
        binding.coordinator.expand(binding.call, !binding.call.expanded);
        return { handled: true };
      })
    : content;
}
function highlight(text: string, path: string, language = getLanguageFromPath(path)): string {
  if (!language || Buffer.byteLength(text) > MAX_HIGHLIGHT_BYTES) return text;
  const lines = text.split("\n");
  if (lines.length > 10_000 || lines.some((line) => Buffer.byteLength(line) > 4096)) return text;
  return highlightCode(text, language).join("\n");
}
function treeRows(
  rows: readonly string[],
  p: Projection,
  first = "  └ ",
  continuation = "    "
): string[] {
  return prefixRows(rows, p.width, p.theme.fg("dim", first), p.theme.fg("dim", continuation));
}
function compactOutput(
  rows: readonly string[],
  maximum: number,
  p: Projection,
  width = bodyWidth(p.width)
): string[] {
  return compactRows(rows, maximum, width, expansionHint(), (notice) => p.theme.fg("dim", notice));
}
function styleParameters(text: string, theme: DisplayTheme): string {
  if (Buffer.byteLength(text) > MAX_HIGHLIGHT_BYTES) return theme.fg("text", text);
  // Tokenize our serialized JSON, not arbitrary output. Quoted values may contain
  // punctuation and escaped quotes that must not be mistaken for structure.
  return text.replace(
    /"(?:\\.|[^"\\])*"(\s*:)?|[{}[\],:]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null/g,
    (token: string, colon: string | undefined) =>
      theme.fg(colon || "{}[],:".includes(token) ? "dim" : "text", token)
  );
}
function output(
  text: string,
  p: Projection,
  maximum = 5,
  first = "  └ ",
  expanded = p.expanded
): string[] {
  const rows = wrapRows(text, bodyWidth(p.width));
  return treeRows(expanded ? rows : compactOutput(rows, maximum, p), p, first);
}
function message(text: string, p: Projection, color: Parameters<Theme["fg"]>[0]): string[] {
  return treeRows(wrapRows(p.theme.fg(color, displayText(text)), bodyWidth(p.width)), p);
}
function reference(label: string, value: string, p: Projection): string {
  return p.theme.fg("dim", label) + p.theme.fg("text", displayText(value));
}
function titleRows(title: string, detail: string, p: Projection): string[] {
  if (p.adapter.family === "invocation" && visibleWidth(title) + 1 + visibleWidth(detail) > p.width)
    return [
      truncateToWidth(title, p.width, "…"),
      ...treeRows(wrapRows(detail, bodyWidth(p.width)), p, "  │ ", "  │ ")
    ];
  const source = detail.split("\n");
  const first = wrapRows(source[0] ?? "", Math.max(1, p.width - visibleWidth(title) - 1));
  const rest = [
    ...first.slice(1),
    ...source.slice(1).flatMap((line) => wrapRows(line, bodyWidth(p.width)))
  ];
  const rows = [truncateToWidth(`${title}${first.length ? ` ${first[0]}` : ""}`, p.width, "")];
  rows.push(...treeRows(p.expanded ? rest : rest.slice(0, 2), p, "  │ ", "  │ "));
  if (!p.expanded && rest.length > 2)
    rows.push(
      truncateToWidth(
        p.theme.fg("dim", `  │ … ${rest.length - 2} more rows (${expansionHint()})`),
        p.width,
        "…"
      )
    );
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
function cancellation(call: DisplayCall): boolean {
  return call.outcome === "cancelled" || call.operation?.outcome === "cancelled";
}
function groupHeading(group: DisplayGroup, p: Projection): string[] {
  if (group.members[0] !== p.call) return [];
  const active = group.members.some(isLive);
  const marker = active && p.phase ? "◦" : "•";
  const rows = [
    `${p.theme.fg(active ? "accent" : "dim", marker)} ${p.theme.fg("toolTitle", p.theme.bold(active ? "Exploring" : "Explored"))}`
  ];
  rows.push(
    ...treeRows(
      explorationSummary(group).flatMap((item) =>
        wrapRows(
          `${p.theme.fg("accent", item.label)} ${p.theme.fg("text", displayText(item.text))}`,
          bodyWidth(p.width)
        )
      ),
      p
    )
  );
  if (!active) {
    const failed = group.members.filter(
      (member) => member.outcome === "failure" && !cancellation(member)
    ).length;
    const cancelled = group.members.filter(cancellation).length;
    const unavailable = group.members.filter((member) => member.outcome === "unavailable").length;
    const summary = [
      failed ? p.theme.fg("error", `${failed} failed`) : "",
      cancelled ? p.theme.fg("warning", `${cancelled} cancelled`) : "",
      unavailable ? p.theme.fg("muted", `${unavailable} outcome unavailable`) : ""
    ]
      .filter(Boolean)
      .join(p.theme.fg("dim", ", "));
    if (summary) rows.push(...output(summary, p, 5, "    ", true));
  }
  rows.push(...groupResultRows(group, p));
  return rows;
}
function groupResultRows(group: DisplayGroup, p: Projection): string[] {
  return group.members.flatMap((member) => {
    if (!member.result) return [];
    const rows: string[] = [];
    if (member.outcome === "failure" || cancellation(member)) {
      const diagnostic = member.result.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      rows.push(
        ...output(
          p.theme.fg(cancellation(member) ? "warning" : "error", displayText(diagnostic)),
          p,
          5,
          "    "
        )
      );
    }
    rows.push(...notices(member.result, { ...p, call: member, adapter: member.adapter }));
    return rows;
  });
}
function phase(p: Projection): string {
  if (p.call) return p.call.lifecycle;
  if (!p.context.isPartial) return "complete";
  if (!p.context.argsComplete) return "preparing";
  return p.context.executionStarted ? "executing" : "queued";
}
function status(p: Projection): {
  verb: string;
  color: Parameters<Theme["fg"]>[0];
  pending: boolean;
} {
  const current = phase(p);
  const pending = ["preparing", "queued", "executing"].includes(current);
  const failed = p.call ? p.call.outcome === "failure" : p.context.isError;
  let verb = pending ? verbs[p.adapter.family][0] : verbs[p.adapter.family][1];
  if (current === "unavailable") verb = "Outcome unavailable";
  if (current === "preparing") verb = "Preparing";
  if (current === "queued") verb = "Queued";
  if (p.call && cancellation(p.call))
    return { verb: "Cancelled", color: "warning", pending: false };
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
function invocation(p: Projection): string {
  const mcp = p.adapter.mcp?.(p.context.args, p.result);
  const name = mcp ? displayText(`${mcp.server}.${mcp.tool}`) : p.name;
  if (p.adapter.family === "invocation" && !p.showParameters) return p.theme.fg("accent", name);
  return (
    p.adapter.invocation?.(p.context.args) ??
    invocationParts(name, p.context.args, p.adapter.family)
  )
    .filter((part) => part.kind !== "parameters" || p.showParameters)
    .map((part) => {
      const text = displayText(part.text);
      if (part.kind === "annotation") return p.theme.fg("dim", text);
      if (part.kind === "parameters") return styleParameters(text, p.theme);
      if (p.adapter.family === "shell")
        return highlight(text, "", p.name === "powershell" ? "powershell" : "bash");
      return p.theme.fg(p.adapter.family === "invocation" ? "accent" : "text", text);
    })
    .join("");
}
function heading(p: Projection): string[] {
  if (p.group && !p.expanded) return groupHeading(p.group, p);
  const state = status(p);
  const typedOutcome = p.adapter.mcp?.(p.context.args, p.result)?.outcome;
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
      ...treeRows(
        wrapRows(
          styleParameters(
            displayText(
              JSON.stringify(p.context.args === undefined ? {} : p.context.args, null, 2)
            ),
            p.theme
          ),
          bodyWidth(p.width)
        ),
        p,
        "  │ ",
        "  │ "
      )
    );
  return rows;
}
function patchRows(patch: string, p: Projection): string[] | undefined {
  const parsed = parsePatch(patch);
  if (!parsed) return undefined;
  const digits = String(
    Math.max(1, ...parsed.lines.map((line) => line.newLine ?? line.oldLine ?? 0))
  ).length;
  const rows = treeRows(
    [
      `${p.theme.fg("toolDiffAdded", `+${parsed.added}`)} ${p.theme.fg("toolDiffRemoved", `-${parsed.removed}`)}`
    ],
    p
  );
  const body = parsed.lines.flatMap((line) => {
    if (line.kind === "separator")
      return [`    ${" ".repeat(digits + 1)}${p.theme.fg("dim", "⋮")}`];
    const number = String(line.kind === "removed" ? line.oldLine : line.newLine).padStart(digits);
    const token =
      line.kind === "added"
        ? "toolDiffAdded"
        : line.kind === "removed"
          ? "toolDiffRemoved"
          : "toolDiffContext";
    const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
    const source = displayText(line.text);
    const highlighted = highlight(source, stringField(record(p.context.args).path));
    const content = highlighted === source ? p.theme.fg(token, source) : highlighted;
    const wrapped = wrapRows(content, Math.max(1, p.width - digits - 6));
    return (wrapped.length ? wrapped : [""]).map((row, index) =>
      index === 0
        ? `    ${p.theme.fg("dim", number)} ${p.theme.fg(token, sign)}${row}`
        : `    ${" ".repeat(digits + 2)}${row}`
    );
  });
  rows.push(...(p.expanded ? body : compactOutput(body, 12, p, p.width)));
  return rows;
}
function applicationFailure(p: Projection): string[] {
  const outcome = p.call?.operation?.outcome;
  if (!p.context.isError && outcome !== "failure") return [];
  return message(
    outcome === "success"
      ? "Tool result reports failure after application."
      : "Failed to apply change",
    p,
    p.call && cancellation(p.call) ? "warning" : "error"
  );
}
function changeRows(
  result: AgentToolResult<unknown>,
  p: Projection
): { rows: string[]; hasPatch: boolean } {
  const patch =
    p.adapter.patch && !p.context.isError ? stringField(record(result.details).patch) : "";
  const proposal = p.call?.change?.patch;
  const rows: string[] = [];
  if (patch || proposal) {
    if (!patch && p.call?.operation?.outcome !== "success")
      rows.push(...message("Proposed change; application not confirmed.", p, "warning"));
    rows.push(
      ...(patchRows(patch || proposal!, p) ??
        message("Patch display unavailable: invalid or oversized patch.", p, "warning"))
    );
    rows.push(...applicationFailure(p));
  }
  if (p.call?.change?.availability === "unavailable")
    rows.push(...message(p.call.change.reason ?? "Change information unavailable.", p, "warning"));
  return { rows, hasPatch: !!(patch || proposal) };
}
function mcpRows(facts: McpFacts, p: Projection): string[] {
  const rows: string[] = [];
  const failed = facts.outcome === "transport-error" || facts.outcome === "returned-error";
  if (facts.outcome === "transport-error") rows.push(...message("Transport error", p, "error"));
  if (facts.outcome === "returned-error")
    rows.push(...message("Tool returned an error", p, "error"));
  for (const block of facts.content) {
    const text =
      block.type === "text"
        ? p.theme.fg(failed ? "error" : "toolOutput", displayText(block.text))
        : block.type === "resource"
          ? `${reference("Resource: ", block.uri, p)}${block.text ? `\n${p.theme.fg("toolOutput", displayText(block.text))}` : ""}`
          : `${reference("[Media: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`;
    rows.push(
      ...output(
        text,
        p,
        block.type === "text" ? 10 : Number.MAX_SAFE_INTEGER,
        rows.length ? "    " : "  └ "
      )
    );
  }
  return rows;
}
function imageNotices(content: AgentToolResult<unknown>["content"], p: Projection): string[] {
  if (p.context.showImages && getCapabilities().images) return [];
  return content.flatMap((block) =>
    block.type === "image"
      ? output(
          `${reference("[Image: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`,
          p,
          5,
          "  └ ",
          true
        )
      : []
  );
}
function styleResultParts(parts: readonly ResultTextPart[], p: Projection): string {
  return parts
    .map((part) => {
      if (!part.text) return "";
      if (part.kind !== "output")
        return p.theme.fg(
          part.kind === "annotation" ? "dim" : part.kind === "value" ? "text" : part.kind,
          displayText(part.text)
        );
      let content = p.adapter.family === "shell" ? styledOutput(part.text) : displayText(part.text);
      if (p.adapter.family === "read" && p.expanded && !p.context.isError)
        content = highlight(content, stringField(record(p.context.args).path));
      return content ? p.theme.fg("toolOutput", content) : "";
    })
    .join("");
}
function emptyOutputText(p: Projection): string {
  const unavailable = p.call?.lifecycle === "unavailable";
  return p.theme.fg(
    unavailable ? "muted" : "dim",
    unavailable
      ? "Output unavailable."
      : p.context.isPartial
        ? "Waiting for output…"
        : "(no output)"
  );
}
function previewParts(preview: OutputText): ResultTextPart[] {
  let start = 0;
  const parts: ResultTextPart[] = [];
  for (const range of preview.omissions ?? []) {
    parts.push(
      { kind: "output", text: preview.text.slice(start, range.start) },
      { kind: "warning", text: preview.text.slice(range.start, range.end) }
    );
    start = range.end;
  }
  parts.push({ kind: "output", text: preview.text.slice(start) });
  return parts;
}
function outputPreview(p: Projection): OutputText | undefined {
  const saved = p.expanded ? p.call?.savedOutput : undefined;
  if (saved?.text !== undefined) return { ...saved, text: saved.text };
  return p.call?.lifecycle !== "complete" ? p.call?.liveOutput : undefined;
}
function contentRows(result: AgentToolResult<unknown>, p: Projection): string[] {
  const preview = outputPreview(p);
  const rows =
    preview === undefined
      ? []
      : output(styleResultParts(previewParts(preview), p) || emptyOutputText(p), p);
  // Saved files contain process output, not Pi's failure footer or result middleware diagnostics.
  if (preview !== undefined && !p.context.isError) return rows;
  const textContext = {
    ...p.context,
    hasImages: result.content.some((block) => block.type === "image")
  };
  for (const block of result.content) {
    if (block.type === "image") {
      rows.push(...imageNotices([block], p));
      continue;
    }
    const parts = p.adapter.textParts?.(block.text, p.context.args, textContext) ?? [
      { kind: p.context.isError ? "error" : "output", text: block.text } satisfies ResultTextPart
    ];
    const text = styleResultParts(parts, p);
    rows.push(
      ...output(
        text || emptyOutputText(p),
        p,
        p.adapter.family === "invocation" ? 10 : 5,
        rows.length ? "    " : "  └ "
      )
    );
  }
  if (!result.content.length && preview === undefined) rows.push(...output(emptyOutputText(p), p));
  return rows;
}
function unavailableHistory(p: Projection): DisplayNotice[] {
  if (p.call?.origin !== "historical") return [];
  const notices: DisplayNotice[] = [];
  if (p.adapter.id === "pi:write" && !p.call.change)
    notices.push({ kind: "unavailable", text: "Before-state unavailable; no historical diff." });
  if (
    p.expanded &&
    !p.call.operation &&
    ["pi:bash", "pi:powershell", "pi:edit", "pi:write"].includes(p.adapter.id)
  )
    notices.push({
      kind: "unavailable",
      text: "Operation details unavailable; call was not observed."
    });
  return notices;
}
function notices(result: AgentToolResult<unknown>, p: Projection): string[] {
  const notices = [
    ...(p.adapter.id.startsWith("pi:") ? resultNotices(result.details) : []),
    ...(p.adapter.notices?.(result, p.expanded) ?? [])
  ];
  const path = p.call?.savedPath;
  if (path && !notices.some((notice) => notice.kind === "reference" && notice.value === path))
    notices.push({ kind: "reference", label: "Saved output", value: path });
  if (p.call?.savedOutput?.notice)
    notices.push({ kind: "warning", text: p.call.savedOutput.notice });
  notices.push(...unavailableHistory(p));
  const rows = notices.flatMap((notice) => {
    const text =
      notice.kind === "reference"
        ? reference(`${displayText(notice.label)}: `, notice.value, p)
        : p.theme.fg(
            notice.kind === "info" ? "dim" : notice.kind === "unavailable" ? "muted" : notice.kind,
            displayText(notice.text)
          );
    return treeRows(wrapRows(text, bodyWidth(p.width)), p, "    ");
  });
  if (p.expanded && p.call?.operation) {
    const operation = p.call.operation;
    const color =
      operation.outcome === "failure"
        ? "error"
        : operation.outcome === "cancelled"
          ? "warning"
          : operation.outcome === "unavailable"
            ? "muted"
            : "dim";
    const detail =
      p.theme.fg("dim", "Operation: ") +
      p.theme.fg(color, operation.outcome) +
      p.theme.fg("dim", `; ${Math.round(operation.durationMs)}ms`) +
      (operation.exitCode !== undefined
        ? p.theme.fg("dim", "; exit ") + p.theme.fg(color, String(operation.exitCode ?? "unknown"))
        : "") +
      (operation.timedOut ? p.theme.fg("error", "; timed out") : "");
    rows.push(...output(detail, p, 5, "    ", true));
  }
  return rows;
}
function resultRows(result: AgentToolResult<unknown>, p: Projection): string[] {
  const current = p.result ?? result;
  if (p.group && !p.expanded) return imageNotices(current.content, p);
  if (p.adapter.family === "read" && !p.expanded && !p.context.isError && !p.context.isPartial)
    return [...imageNotices(current.content, p), ...notices(current, p)];
  const change = changeRows(current, p);
  const facts = p.adapter.mcp?.(p.context.args, current);
  const rows = change.rows;
  if (facts) rows.push(...mcpRows(facts, p));
  else if (!change.hasPatch || p.context.isError) rows.push(...contentRows(current, p));
  rows.push(...notices(current, p));
  return rows;
}
/** Explicit owner/SDK integration. No adapter means generic even for built-in names. */
export function createToolDisplayRenderers(
  name: string,
  adapter: ToolDisplayAdapter = genericAdapter,
  options: ToolDisplayRendererOptions = {}
): ToolDisplayRenderers {
  const { binding } = options;
  // Pi calls the header slot before the result slot, then renders both components.
  // Key retained results by Pi's row-local state so owner factories can serve many rows.
  const results = new WeakMap<object, AgentToolResult<unknown>>();
  const projection = (context: DisplayContext, theme: DisplayTheme, width: number): Projection => {
    const selected = binding?.call.adapter ?? adapter;
    const current =
      selected.id.startsWith("fff:") &&
      binding?.call.result &&
      !selected.exploration?.(binding.call.args, binding.call.result)
        ? genericAdapter
        : selected;
    return {
      name: displayText(name),
      adapter: current,
      showParameters: current.id === "generic" || options.showParameters === true,
      context,
      theme,
      width,
      expanded: binding?.coordinator.calls.has(binding.call.key)
        ? binding.call.expanded
        : context.expanded,
      call: binding?.call,
      result:
        binding?.call.result ??
        (context.state !== null && typeof context.state === "object"
          ? results.get(context.state)
          : undefined),
      group: binding ? binding.coordinator.group(binding.call) : undefined,
      phase: binding?.coordinator.phase ?? 1
    };
  };
  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      return component(
        context,
        (width) => heading(projection({ ...context, args }, theme, width)),
        binding
      );
    },
    renderResult(result, options, theme, context) {
      if (!binding && context.state !== null && typeof context.state === "object")
        results.set(context.state, result);
      return component(
        context,
        (width) => resultRows(result, projection({ ...context, ...options }, theme, width)),
        binding
      );
    }
  };
}
