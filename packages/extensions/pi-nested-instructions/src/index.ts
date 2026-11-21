import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { joinLifecycle } from "@pi-mono/libs/lifecycle";
import { containsPath } from "@pi-mono/utils/paths";

import { discover, refresh } from "./discovery.ts";
import type { Invocation } from "./scopes.ts";
import { findSkillFolders, type SkillFolders } from "./skill-folders.ts";

export default function nestedInstructions(pi: ExtensionAPI) {
  const lifecycle = joinLifecycle(pi, { id: "pi-nested-instructions" });
  let nestedCalls: Invocation[] = [];
  let skillFolders: SkillFolders = new Map();
  let hostSkills = new Set<string>();
  // Pi has no API to register skills later, so every nested skill folder registers at startup and reload.
  pi.on("resources_discover", () => {
    // Pi reloads its resources before this event and applies the returned paths after every handler, so the commands hold only the skills that Pi loads without them.
    hostSkills = new Set(
      pi
        .getCommands()
        .flatMap((command) => (command.source === "skill" ? [command.sourceInfo.path] : []))
    );

    return { skillPaths: [...skillFolders.values()].flat() };
  });
  // Nested skills stay out of the system prompt on every run; listings announce them instead.
  pi.on("before_agent_start", (event) => {
    const options = event.systemPromptOptions;
    const folders = [...skillFolders.values()].flat();
    options.skills = options.skills.filter(
      (skill) =>
        hostSkills.has(skill.filePath) ||
        !folders.some((folder) => containsPath(folder, skill.filePath))
    );
  });
  pi.on("turn_start", () => {
    nestedCalls = [];
  });
  pi.on("tool_execution_start", (event) => {
    if (!event.parentToolCallId) return;
    nestedCalls.push({
      toolCallId: event.toolCallId,
      parentToolCallId: event.parentToolCallId,
      toolName: event.toolName,
      input: event.args
    });
  });
  pi.on("turn_end", async (event, ctx) => {
    const calls = nestedCalls;
    nestedCalls = [];
    if (event.message.role !== "assistant") return;

    // Issued inputs count even if validation or a guard blocked execution. Never inspect event.toolResults, including their success status.
    for (const call of event.message.content) {
      if (call.type !== "toolCall") continue;
      calls.push({
        toolCallId: call.id,
        callEntryId: event.messageEntryId,
        toolName: call.name,
        input: call.arguments
      });
    }

    // Earlier boundary handlers can add notices or edit context before drafts are committed.
    const branch = ctx.sessionManager.getBranch();
    const projected = event.context.contextEntries;
    const entries = new Map(
      [...branch, ...projected.map((entry) => entry.sourceEntry)].map((entry) => [entry.id, entry])
    );
    const discovered = await discover(
      calls,
      ctx.cwd,
      {
        buildSessionProjection: () => ({ entries: projected }),
        getBranch: () => [...entries.values()]
      },
      skillFolders
    );

    return { entries: [...event.entries, ...discovered] };
  });
  pi.on("session_shutdown", () => {
    nestedCalls = [];
  });
  lifecycle.onSessionStart(async (_event, ctx, arrival) => {
    nestedCalls = [];
    // Pi emits resources_discover after this handler settles, so the search is complete by then.
    skillFolders = ctx.isProjectTrusted() ? await findSkillFolders(ctx.cwd) : new Map();
    const messages = await refresh(ctx.cwd, ctx.sessionManager, skillFolders);
    if (!messages.length) return;
    // An idle sendMessage appends at once. At rank 100, the messages precede the startup entries of pi-profiles (rank 200) in every load order.
    arrival.commit(100, () => {
      for (const message of messages) pi.sendMessage(message, { triggerTurn: false });
    });
  });
}
