import { existsSync, unlinkSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { quotePosixShellArgument } from "@pi-mono/utils/shell";

import { saveActiveBranch } from "./persist.ts";

export type SessionCommandContext = Pick<
  ExtensionCommandContext,
  "cwd" | "sessionManager" | "isIdle" | "switchSession" | "newSession"
> & { ui: Pick<ExtensionCommandContext["ui"], "notify"> };

export async function persistSession(
  ctx: Omit<SessionCommandContext, "newSession">
): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify("The agent is running. Wait until idle, then retry /sesh persist.", "warning");

    return;
  }

  if (ctx.sessionManager.getSessionFile()) {
    ctx.ui.notify("This session is already file-backed", "info");

    return;
  }

  const path = saveActiveBranch(ctx.cwd, ctx.sessionManager);
  const result = await ctx.switchSession(path, {
    withSession: async (replacementCtx) => {
      replacementCtx.ui.notify(`Session saved to ${path}`, "info");
    }
  });

  if (result.cancelled) {
    unlinkSync(path);
    ctx.ui.notify("Session switch cancelled; no file saved", "info");
  }
}

function busyChildGuidance(parentSession: string | undefined): string {
  if (!parentSession) {
    return "This session is ephemeral. Once idle, run /sesh persist before creating a linked session.";
  }

  if (!existsSync(parentSession)) {
    return "The parent session has not been saved yet. Wait for an assistant response before creating a linked session.";
  }

  return `To create a linked session in another terminal, run:\npi --parent-session ${quotePosixShellArgument(parentSession)}`;
}

export async function createEmptyChild(ctx: SessionCommandContext): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify(
      `The agent is running; no child session was created.\n${busyChildGuidance(ctx.sessionManager.getSessionFile())}`,
      "warning"
    );

    return;
  }

  const parentSession = ctx.sessionManager.getSessionFile();

  if (!parentSession) {
    ctx.ui.notify("Run /sesh persist before creating a sub-session", "error");

    return;
  }

  // Pi assigns a file path before writing it. A child must not point to a nonexistent parent.
  if (!existsSync(parentSession)) {
    ctx.ui.notify(
      "The parent session has not been saved yet. Wait for an assistant response.",
      "error"
    );

    return;
  }

  const result = await ctx.newSession({
    parentSession,
    withSession: async (replacementCtx) => {
      replacementCtx.ui.notify("Created an empty sub-session", "info");
    }
  });
  if (result.cancelled) ctx.ui.notify("Sub-session creation cancelled", "info");
}

export async function runSessionCommand(args: string, ctx: SessionCommandContext): Promise<void> {
  switch (args.trim()) {
    case "persist":
      await persistSession(ctx);
      break;
    case "create-empty-child":
      await createEmptyChild(ctx);
      break;
    default:
      ctx.ui.notify("Usage: /sesh persist | /sesh create-empty-child", "error");
  }
}

const subcommands = [
  { value: "persist", description: "Save this ephemeral session to disk" },
  {
    value: "create-empty-child",
    description: "Start an empty session linked to this saved session"
  }
];

export function registerSessionCommand(pi: Pick<ExtensionAPI, "registerCommand">): void {
  let running = false;
  pi.registerCommand("sesh", {
    description: "Persist an ephemeral session or create an empty sub-session",
    getArgumentCompletions: (prefix) => {
      const matches = subcommands.filter(
        ({ value }) => value.startsWith(prefix) && value !== prefix
      );

      return matches.length
        ? matches.map(({ value, description }) => ({ value, label: value, description }))
        : null;
    },
    handler: async (args, ctx) => {
      if (running) {
        ctx.ui.notify("A session operation is already in progress", "warning");

        return;
      }

      running = true;

      try {
        await runSessionCommand(args, ctx);
      } finally {
        running = false;
      }
    }
  });
}
