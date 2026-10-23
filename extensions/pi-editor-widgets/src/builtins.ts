import { relative, resolve, sep } from "node:path";

import type {
  AgentSession,
  ContextUsage,
  ReadonlyFooterDataProvider,
  SessionStats,
  Theme
} from "@earendil-works/pi-coding-agent";
import { compactDisplayText } from "@pi-mono/libs/tui/terminal-text";
import { formatTokenCount } from "@pi-mono/libs/tui/token-count";
import { containsPath } from "@pi-mono/utils/paths";

function formatCwd(cwd: string, home = process.env.HOME || process.env.USERPROFILE): string {
  if (!home) return compactDisplayText(cwd);
  const root = resolve(home);
  const absolute = resolve(cwd);
  if (!containsPath(root, absolute)) return compactDisplayText(cwd);
  const path = relative(root, absolute);

  return compactDisplayText(`~${path ? sep + path : ""}`);
}

type UsageDisplay = "regular" | "compact" | "verbose";

type Usage = {
  sessionId: string;
  leafId: string | null;
  entryCount: number;
  limitsModel: AgentSession["model"];
  tokens: SessionStats["tokens"];
  cost: number;
  hit: number | undefined;
  context: ContextUsage | undefined;
};

const usageCache = new WeakMap<AgentSession, Usage>();

/**
 * Usage totals and context usage scan the whole session, and widgets render on every frame.
 * Entries are append-only and every append moves the leaf, so, as in Pi's native footer, the
 * results change only with the session, leaf, entry count, or the model whose limits apply.
 */
function usageOf(session: AgentSession): Usage {
  const manager = session.sessionManager;
  const sessionId = manager.getSessionId();
  const leafId = manager.getLeafId();
  const entryCount = manager.getEntryCount();
  const limitsModel = session.routedModel?.model ?? session.model;
  const cached = usageCache.get(session);
  if (
    cached?.sessionId === sessionId &&
    cached.leafId === leafId &&
    cached.entryCount === entryCount &&
    cached.limitsModel === limitsModel
  )
    return cached;
  // getSessionStats() also projects context usage, so reuse it instead of projecting again.
  const stats = session.getSessionStats();
  let hit: number | undefined;
  const entries = manager.getEntries();

  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    const latest = entry.message.usage;
    const prompt = latest.input + latest.cacheRead + latest.cacheWrite;
    hit = prompt > 0 ? (latest.cacheRead / prompt) * 100 : undefined;
    break;
  }

  const next = {
    sessionId,
    leafId,
    entryCount,
    limitsModel,
    tokens: stats.tokens,
    cost: stats.cost,
    hit,
    context: stats.contextUsage
  };
  usageCache.set(session, next);

  return next;
}

function tokens(session: AgentSession, display: UsageDisplay): string {
  const { tokens: usage, cost, hit } = usageOf(session);
  const parts: string[] = [];

  for (const [key, prefix] of [
    ["input", "↑"],
    ["output", "↓"]
  ] as const) {
    if (usage[key]) parts.push(`${prefix}${formatTokenCount(usage[key])}`);
  }

  if (display === "compact") return parts.join(" ");

  for (const [key, prefix] of [
    ["cacheRead", "R"],
    ["cacheWrite", "W"]
  ] as const) {
    if (usage[key]) parts.push(`${prefix}${formatTokenCount(usage[key])}`);
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

function context(session: AgentSession, theme: Theme, display: UsageDisplay): string {
  const usage = usageOf(session).context;
  const tokens = usage?.tokens;
  const percent = usage?.percent;
  const window = usage?.contextWindow;
  const used = tokens == null ? "?" : formatTokenCount(tokens);
  const total = window === undefined ? "?" : formatTokenCount(window);
  const share = display === "compact" || percent == null ? "" : ` (${percent.toFixed(1)}%)`;
  let auto = session.autoCompactionEnabled ? " (auto)" : "";

  if (auto && display === "verbose" && window !== undefined) {
    let trigger = "?";

    try {
      // Pi uses the selected model's reserve even when the window comes from a routed model.
      const reserve = session.settingsManager.getCompactionReserveTokens(session.model);
      trigger = formatTokenCount(window - reserve);
    } catch {
      // Invalid native compaction settings must not break the widget render loop.
    }

    auto = ` (auto ~${trigger})`;
  }

  return theme.fg("dim", `${used}/${total}${share}${auto}`);
}

export function builtinText(
  session: AgentSession,
  footer: ReadonlyFooterDataProvider,
  theme: Theme,
  {
    contextDisplay = "regular",
    tokensDisplay = "regular"
  }: {
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
    ["builtin:context", context(session, theme, contextDisplay)],
    ["builtin:model", theme.fg("dim", compactDisplayText(modelText))]
  ]);
}
