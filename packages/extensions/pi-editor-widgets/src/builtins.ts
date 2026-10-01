import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  AgentSession,
  ReadonlyFooterDataProvider,
  Theme,
  ThemeColor
} from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;

  return `${Math.round(count / 1000000)}M`;
}

export function formatCwd(cwd: string, home = process.env.HOME || process.env.USERPROFILE): string {
  if (!home) return compactDisplayText(cwd);
  const path = relative(resolve(home), resolve(cwd));
  const inside =
    path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));

  return compactDisplayText(inside ? `~${path ? sep + path : ""}` : cwd);
}

type UsageDisplay = "regular" | "compact" | "verbose";

function tokens(session: AgentSession, display: UsageDisplay): string {
  const { tokens: usage, cost } = session.getSessionStats();
  const parts: string[] = [];

  for (const [key, prefix] of [
    ["input", "↑"],
    ["output", "↓"]
  ] as const) {
    if (usage[key]) parts.push(`${prefix}${formatTokens(usage[key])}`);
  }

  if (display === "compact") return parts.join(" ");

  for (const [key, prefix] of [
    ["cacheRead", "R"],
    ["cacheWrite", "W"]
  ] as const) {
    if (usage[key]) parts.push(`${prefix}${formatTokens(usage[key])}`);
  }

  let hit: number | undefined;

  for (const entry of session.sessionManager.getEntries()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const latest = entry.message.usage;
    const prompt = latest.input + latest.cacheRead + latest.cacheWrite;
    hit = prompt > 0 ? (latest.cacheRead / prompt) * 100 : undefined;
  }

  if ((usage.cacheRead || usage.cacheWrite) && hit !== undefined)
    parts.push(`CH${hit.toFixed(1)}%`);
  const model = session.model;
  const subscription =
    model !== undefined &&
    (model.provider === "kimi-coding" || session.modelRuntime.isUsingSubscription(model.provider));
  if (cost || subscription) parts.push(`$${cost.toFixed(3)}${subscription ? " (sub)" : ""}`);

  return parts.join(" ");
}

/** A token threshold splits usage into thirds; otherwise percentages of the window apply. */
function contextColor(
  tokens: number | null | undefined,
  percent: number | null | undefined,
  threshold: number | undefined
): ThemeColor {
  if (threshold !== undefined) {
    if (tokens == null) return "dim";
    if (tokens >= threshold) return "error";
    if (tokens >= (threshold * 2) / 3) return "warning";
    if (tokens >= threshold / 3) return "success";

    return "dim";
  }

  if (percent != null && percent > 90) return "error";
  if (percent != null && percent > 70) return "warning";

  return "dim";
}

function context(
  session: AgentSession,
  theme: Theme,
  threshold: number | undefined,
  display: UsageDisplay
): string {
  const usage = session.getContextUsage();
  const tokens = usage?.tokens;
  const percent = usage?.percent;
  const window = usage?.contextWindow;
  const used = tokens == null ? "?" : formatTokens(tokens);
  const total = window === undefined ? "?" : formatTokens(window);
  const share = display === "compact" || percent == null ? "" : ` (${percent.toFixed(1)}%)`;
  let auto = session.autoCompactionEnabled ? " (auto)" : "";

  if (auto && display === "verbose" && window !== undefined) {
    let trigger = "?";

    try {
      // Pi uses the selected model's reserve even when the window comes from a routed model.
      const reserve = session.settingsManager.getCompactionReserveTokens(session.model);
      trigger = formatTokens(window - reserve);
    } catch {
      // Invalid native compaction settings must not break the widget render loop.
    }

    auto = ` (auto ~${trigger})`;
  }

  return theme.fg(contextColor(tokens, percent, threshold), `${used}/${total}${share}${auto}`);
}

export function builtinText(
  session: AgentSession,
  footer: ReadonlyFooterDataProvider,
  theme: Theme,
  {
    contextThreshold,
    contextDisplay = "regular",
    tokensDisplay = "regular"
  }: {
    contextThreshold?: number | undefined;
    contextDisplay?: UsageDisplay;
    tokensDisplay?: UsageDisplay;
  } = {}
): Map<string, string> {
  const model = session.model;
  let modelText = "no-model";
  if (model)
    modelText = `${model.provider}/${model.id}${model.reasoning ? `:${session.thinkingLevel}` : ""}`;
  // A virtual selection routes each request; show where the latest response went, as Pi's footer does.
  const routed = session.routedModel;
  if (routed)
    modelText += ` → ${routed.model.id}${routed.model.reasoning && routed.thinkingLevel ? `:${routed.thinkingLevel}` : ""}`;

  return new Map([
    ["builtin:cwd", theme.fg("dim", formatCwd(session.sessionManager.getCwd()))],
    ["builtin:git-branch", theme.fg("dim", compactDisplayText(footer.getGitBranch() ?? ""))],
    [
      "builtin:session-title",
      theme.fg("dim", compactDisplayText(session.sessionManager.getSessionName() ?? ""))
    ],
    ["builtin:tokens", theme.fg("dim", tokens(session, tokensDisplay))],
    ["builtin:context", context(session, theme, contextThreshold, contextDisplay)],
    ["builtin:model", theme.fg("dim", compactDisplayText(modelText))]
  ]);
}
