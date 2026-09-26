import { isAbsolute, relative, resolve, sep } from "node:path";

import type {
  AgentSession,
  ReadonlyFooterDataProvider,
  Theme
} from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";

export function formatTokens(count: number): string {
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

function tokens(session: AgentSession): string {
  const { tokens: usage, cost } = session.getSessionStats();
  const parts: string[] = [];

  for (const [key, prefix] of [
    ["input", "↑"],
    ["output", "↓"],
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

function context(session: AgentSession, theme: Theme): string {
  const usage = session.getContextUsage();
  const percent = usage?.percent;
  const window = usage?.contextWindow ?? session.model?.contextWindow;
  const text = `${percent == null ? "?" : `${percent.toFixed(1)}%`}/${window === undefined ? "?" : formatTokens(window)}${session.autoCompactionEnabled ? " (auto)" : ""}`;
  if (percent != null && percent > 90) return theme.fg("error", text);
  if (percent != null && percent > 70) return theme.fg("warning", text);

  return theme.fg("dim", text);
}

export function builtinText(
  session: AgentSession,
  footer: ReadonlyFooterDataProvider,
  theme: Theme
): Map<string, string> {
  const model = session.model;
  let modelText = "no-model";
  if (model)
    modelText = `${model.provider}/${model.id}${model.reasoning ? `:${session.thinkingLevel}` : ""}`;

  return new Map([
    ["builtin:cwd", theme.fg("dim", formatCwd(session.sessionManager.getCwd()))],
    ["builtin:git-branch", theme.fg("dim", compactDisplayText(footer.getGitBranch() ?? ""))],
    [
      "builtin:session-title",
      theme.fg("dim", compactDisplayText(session.sessionManager.getSessionName() ?? ""))
    ],
    ["builtin:tokens", theme.fg("dim", tokens(session))],
    ["builtin:context", context(session, theme)],
    ["builtin:model", theme.fg("dim", compactDisplayText(modelText))]
  ]);
}
