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

import { genericAdapter, resolveResultAdapter } from "./adapters/generic.ts";
import type {
  ToolDisplayAdapter,
  McpFacts,
  DisplayNotice,
  ResultTextPart
} from "./adapters/types.ts";
import { renderDiffBody } from "./diff-view.ts";
import { parsePatch } from "./diff.ts";
import { isLive, type DisplayCall, type DisplayGroup, type ToolFamily } from "./display-model.ts";
import {
  bodyWidth,
  compactText,
  displayText,
  renderTree,
  renderTreeContinuation,
  styledOutput,
  wrapRows,
  type TreeItem
} from "./layout.ts";
import type { OutputText } from "./output-text.ts";
import { invocationParts, invocationPartText, record, stringField } from "./presentation.ts";
import type { TranscriptCoordinator } from "./transcript-coordinator.ts";

export type { ToolFamily } from "./display-model.ts";

type DisplayTheme = Pick<Theme, "fg" | "bg" | "getBgAnsi" | "bold">;

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
  row: RowState;
}

interface RowState {
  result?: AgentToolResult<unknown>;
  body?:
    | { projection: Projection; result: AgentToolResult<unknown>; value: ResultBody }
    | undefined;
}

class DisplayComponent implements Component {
  private width: number | undefined;
  private rows: string[] | undefined;
  constructor(
    private project: (width: number) => string[],
    private reset: () => void
  ) {}
  update(project: (width: number) => string[], reset: () => void): void {
    this.project = project;
    this.reset = reset;
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
    this.reset();
  }
}
const MAX_HIGHLIGHT_BYTES = 512 * 1024;
const expansionHint = () => `${keyText("app.tools.expand")} to expand`;

function component(
  context: DisplayContext,
  project: (width: number) => string[],
  reset: () => void,
  binding?: DisplayBinding
): Component {
  if (!binding && context.lastComponent instanceof DisplayComponent) {
    context.lastComponent.update(project, reset);

    return context.lastComponent;
  }

  const content = new DisplayComponent(project, reset);

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

function tree(items: readonly TreeItem[], p: Projection, followingSibling = false): string[] {
  return renderTree(items, p.width, (text) => p.theme.fg("dim", text), followingSibling);
}

function headingContinuation(rows: readonly string[], p: Projection): string[] {
  if (!rows.length) return [];

  return renderTreeContinuation(
    rows,
    p.width,
    (text) => p.theme.fg("dim", text),
    !!p.result && resultBody(p.result, p).items.some((item) => item.rows.length > 0)
  );
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

function output(text: string, p: Projection, maximum = 5, expanded = p.expanded): string[] {
  const width = bodyWidth(p.width);

  return expanded || maximum === Number.MAX_SAFE_INTEGER
    ? wrapRows(text, width)
    : compactText(text, maximum, width, expansionHint(), (notice) => p.theme.fg("dim", notice));
}

function message(text: string, p: Projection, color: Parameters<Theme["fg"]>[0]): string[] {
  return wrapRows(p.theme.fg(color, displayText(text)), bodyWidth(p.width));
}

function reference(label: string, value: string, p: Projection): string {
  return p.theme.fg("dim", label) + p.theme.fg("text", displayText(value));
}

function titleRows(title: string, detail: string, p: Projection): string[] {
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

function cancellation(call: DisplayCall): boolean {
  return call.outcome === "cancelled" || call.operation?.outcome === "cancelled";
}

function groupHeading(group: DisplayGroup, p: Projection): string[] {
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
  const item: TreeItem = {
    rows: (p.adapter.exploration?.(p.context.args, p.result) ?? []).flatMap((entry) =>
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
  const detail = { ...p, width: p.width - 2 };
  item.rows.push(...groupResultRows(detail).map((row) => `  ${row}`));
  rows.push(...tree([item], p, group.members.at(-1) !== p.call));

  return rows;
}

function groupResultRows(p: Projection): string[] {
  if (!p.call) return [];
  if (!p.result)
    return p.call.lifecycle === "unavailable" ? message("Outcome unavailable", p, "muted") : [];
  const rows: string[] = [];

  if (p.call.outcome === "failure" || cancellation(p.call)) {
    const diagnostic = p.result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    rows.push(
      ...output(p.theme.fg(cancellation(p.call) ? "warning" : "error", displayText(diagnostic)), p)
    );
  }

  rows.push(
    ...imageItems(p.result.content, p).flatMap((item) => item.rows),
    ...notices(p.result, p)
  );
  if (p.call.lifecycle === "unavailable") rows.push(...message("Outcome unavailable", p, "muted"));

  return rows;
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
  const actionVerbs = p.adapter.headingVerbs?.(p.context.args) ?? verbs[p.adapter.family];
  let verb = actionVerbs[pending ? 0 : 1];
  if (current === "unavailable") verb = "Outcome unavailable";
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
  const parts = p.adapter.invocation?.(p.context.args, p.result);
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

function patchRows(
  patch: string,
  p: Projection,
  annotations: readonly string[]
): string[] | undefined {
  const parsed = parsePatch(patch);
  if (!parsed) return undefined;
  // Preserve +0 -0 for empty patches so a no-op still has visible output.
  const oneSided =
    (parsed.added > 0 && parsed.removed === 0) || (parsed.removed > 0 && parsed.added === 0);
  const rows =
    p.adapter.family === "write" && oneSided
      ? []
      : [
          `${p.theme.fg("toolDiffAdded", `+${parsed.added}`)} ${p.theme.fg("toolDiffRemoved", `-${parsed.removed}`)}`
        ];
  const body = renderDiffBody(parsed, {
    width: bodyWidth(p.width),
    expanded: p.expanded,
    expansionHint: expansionHint(),
    theme: p.theme,
    highlight: (source) => highlight(source, stringField(record(p.context.args).path))
  });
  rows.push(...annotations, ...body);

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
  let renderedPatch: string[] | undefined;

  if (patch || proposal) {
    const unconfirmed =
      !patch && p.call?.operation?.outcome !== "success"
        ? message("Proposed change; application not confirmed.", p, "warning")
        : [];
    renderedPatch = patchRows(patch || proposal!, p, unconfirmed);
    rows.push(
      ...(renderedPatch ?? [
        ...unconfirmed,
        ...message("Patch display unavailable: invalid or oversized patch.", p, "warning")
      ])
    );
    rows.push(...applicationFailure(p));
  }

  if (!renderedPatch && p.call?.change?.availability === "unavailable")
    rows.push(...message(p.call.change.reason ?? "Change information unavailable.", p, "warning"));

  return { rows, hasPatch: !!(patch || proposal) };
}

function mcpItems(facts: McpFacts, p: Projection): TreeItem[] {
  const items: TreeItem[] = [];
  const failed =
    p.context.isError || facts.outcome === "transport-error" || facts.outcome === "returned-error";

  for (const block of facts.content) {
    const text =
      block.type === "text"
        ? p.theme.fg(failed ? "error" : "toolOutput", displayText(block.text))
        : block.type === "resource"
          ? `${reference("Resource: ", block.uri, p)}${block.text ? `\n${p.theme.fg("toolOutput", displayText(block.text))}` : ""}`
          : `${reference("[Media: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`;
    items.push({ rows: output(text, p, block.type === "text" ? 10 : Number.MAX_SAFE_INTEGER) });
  }

  return items;
}

function imageItems(content: AgentToolResult<unknown>["content"], p: Projection): TreeItem[] {
  if (p.context.showImages && getCapabilities().images) return [];

  return content.flatMap((block) =>
    block.type === "image"
      ? [
          {
            rows: output(
              `${reference("[Image: ", block.mimeType, p)}${p.theme.fg("dim", "]")}`,
              p,
              5,
              true
            )
          }
        ]
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

function describedImage(
  content: AgentToolResult<unknown>["content"],
  index: number,
  p: Projection
): boolean {
  if (p.context.isPartial || p.context.isError) return false;
  const previous = content[index - 1],
    image = content[index];

  return (
    previous?.type === "text" &&
    image?.type === "image" &&
    p.adapter.imageCaptionMimeType?.(previous.text) === image.mimeType
  );
}

function contentItems(result: AgentToolResult<unknown>, p: Projection): TreeItem[] {
  const preview = outputPreview(p);
  const items: TreeItem[] =
    preview === undefined
      ? []
      : [
          {
            rows: output(styleResultParts(previewParts(preview), p) || emptyOutputText(p), p)
          }
        ];
  // Saved files contain process output, not Pi's failure footer or result middleware diagnostics.
  if (preview !== undefined && !p.context.isError)
    return [...items, ...imageItems(result.content, p)];
  const textContext = {
    ...p.context,
    hasImages: result.content.some((block) => block.type === "image")
  };

  for (const [index, block] of result.content.entries()) {
    if (block.type === "image") {
      if (!describedImage(result.content, index, p)) items.push(...imageItems([block], p));
      continue;
    }

    const parts = p.adapter.textParts?.(block.text, p.context.args, textContext) ?? [
      { kind: p.context.isError ? "error" : "output", text: block.text } satisfies ResultTextPart
    ];
    if (!parts.length) continue;
    const text = styleResultParts(parts, p);
    const rows = output(text || emptyOutputText(p), p, p.adapter.family === "invocation" ? 10 : 5);
    if (index === 0 || result.content[index - 1]?.type === "text") appendDetails(items, rows);
    else items.push({ rows });
  }

  if (!result.content.length && preview === undefined)
    items.push({ rows: output(emptyOutputText(p), p) });

  return items;
}

function appendDetails(items: TreeItem[], rows: string[]): void {
  if (!rows.length) return;
  if (!items.length) items.push({ rows: [] });
  items.at(-1)!.rows.push(...rows);
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
  const notices = [...(p.adapter.notices?.(result, p.expanded) ?? [])];
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

    return wrapRows(text, bodyWidth(p.width));
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
    rows.push(...output(detail, p, 5, true));
  }

  return rows;
}

interface ResultBody {
  items: TreeItem[];
  annotations: string[];
}

function annotateResult(items: TreeItem[], annotations: string[]): ResultBody {
  // Call-level notices must not become children of an unrelated final media/resource.
  // With one result item they can continue its body; otherwise they continue the root.
  if (items.length === 1) {
    appendDetails(items, annotations);

    return { items, annotations: [] };
  }

  return { items, annotations };
}

function resultBody(result: AgentToolResult<unknown>, p: Projection): ResultBody {
  const current = p.result ?? result;
  const cached = p.row.body;
  const previous = cached?.projection;
  if (
    cached &&
    cached.result === current &&
    previous &&
    previous.width === p.width &&
    previous.expanded === p.expanded &&
    previous.adapter === p.adapter &&
    previous.theme === p.theme &&
    previous.context.args === p.context.args &&
    previous.context.cwd === p.context.cwd &&
    previous.context.isError === p.context.isError &&
    previous.context.isPartial === p.context.isPartial &&
    previous.context.showImages === p.context.showImages
  )
    return cached.value;
  const value = buildResultBody(current, p);
  p.row.body = { projection: p, result: current, value };

  return value;
}

function buildResultBody(current: AgentToolResult<unknown>, p: Projection): ResultBody {
  const annotations = notices(current, p);
  if (p.adapter.family === "read" && !p.expanded && !p.context.isError && !p.context.isPartial)
    return annotateResult(imageItems(current.content, p), annotations);
  const change = changeRows(current, p);
  const items: TreeItem[] = change.hasPatch ? [{ rows: change.rows }] : [];
  const facts = p.adapter.mcp?.(p.context.args, current);
  if (facts)
    return {
      items: [...items, ...mcpItems(facts, p)],
      annotations: [
        ...(facts.outcome === "transport-error" ? message("Transport error", p, "error") : []),
        ...(facts.outcome === "returned-error"
          ? message("Tool returned an error", p, "error")
          : []),
        ...(!change.hasPatch ? change.rows : []),
        ...annotations
      ]
    };
  if (!change.hasPatch || p.context.isError) {
    const content = contentItems(current, p);
    if (change.hasPatch || ["edit", "write", "shell"].includes(p.adapter.family))
      appendDetails(
        items,
        content.flatMap((item) => item.rows)
      );
    else items.push(...content);
  } else items.push(...imageItems(current.content, p));
  if (!change.hasPatch) appendDetails(items, change.rows);

  return annotateResult(items, annotations);
}

function resultRows(result: AgentToolResult<unknown>, p: Projection): string[] {
  if (p.group && !p.expanded) return [];
  const { items, annotations } = resultBody(result, p);

  return [
    ...renderTreeContinuation(
      annotations,
      p.width,
      (text) => p.theme.fg("dim", text),
      items.some((item) => item.rows.length > 0)
    ),
    ...tree(items, p)
  ];
}

/** Internal card factory; renderer-api.ts exposes the standalone owner surface. */
export function createToolDisplayRenderers(
  name: string,
  adapter: ToolDisplayAdapter = genericAdapter,
  options: ToolDisplayRendererOptions = {}
): ToolDisplayRenderers {
  const { binding } = options;
  // Pi calls the header slot before the result slot, then renders both components.
  // Key retained results by Pi's row-local state so owner factories can serve many rows.
  const states = new WeakMap<object, RowState>();

  const rowState = (context: DisplayContext): RowState => {
    if (context.state === null || typeof context.state !== "object") return {};
    let row = states.get(context.state);

    if (!row) {
      row = {};
      states.set(context.state, row);
    }

    return row;
  };

  const projection = (context: DisplayContext, theme: DisplayTheme, width: number): Projection => {
    const selected = binding?.call.adapter ?? adapter;
    const current = binding
      ? resolveResultAdapter(selected, binding.call.args, binding.call.result)
      : selected;

    return {
      name: displayText(name),
      adapter: current,
      showParameters: current.id === "generic" || options.showParameters === true,
      // Pi's row can retain streamed arguments and the pre-message_end error flag.
      context: binding
        ? {
            ...context,
            args: binding.call.args,
            isError:
              binding.call.lifecycle === "complete"
                ? binding.call.outcome === "failure" || binding.call.outcome === "cancelled"
                : context.isError
          }
        : context,
      theme,
      width,
      expanded: binding?.coordinator.calls.has(binding.call.key)
        ? binding.call.expanded
        : context.expanded,
      call: binding?.call,
      result: binding?.call.result ?? rowState(context).result,
      group: binding ? binding.coordinator.group(binding.call) : undefined,
      phase: binding?.coordinator.phase ?? 1,
      row: rowState(context)
    };
  };

  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const row = rowState(context);
      row.body = undefined;

      return component(
        context,
        (width) => heading(projection({ ...context, args }, theme, width)),
        () => {
          row.body = undefined;
        },
        binding
      );
    },
    renderResult(result, options, theme, context) {
      const row = rowState(context);
      row.result = result;
      row.body = undefined;

      return component(
        context,
        (width) => resultRows(result, projection({ ...context, ...options }, theme, width)),
        () => {
          row.body = undefined;
        },
        binding
      );
    }
  };
}
