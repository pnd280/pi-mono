import { existsSync, unlinkSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { compactDisplayText, hasUnsafeTerminalControls } from "@pi-mono/libs/tui/terminal-text";
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
    ctx.ui.notify("This session is already saved to a file.", "info");

    return;
  }

  const path = saveActiveBranch(ctx.cwd, ctx.sessionManager);
  const result = await ctx.switchSession(path, {
    withSession: async (replacementCtx) => {
      replacementCtx.ui.notify(`Session saved to ${compactDisplayText(path)}`, "info");
    }
  });

  if (result.cancelled) {
    unlinkSync(path);
    ctx.ui.notify("Session switch cancelled; no file saved.", "info");
  }
}

function busyChildGuidance(parentSession: string | undefined): string {
  if (!parentSession) {
    return "This session is ephemeral. Once idle, run /sesh persist before creating a child session.";
  }

  if (!existsSync(parentSession)) {
    return "The parent session has not been saved yet. Once idle, send a message before creating a child session.";
  }

  // Sanitizing a copyable command would silently point it at a different file.
  if (hasUnsafeTerminalControls(parentSession) || /[\r\n\t]/.test(parentSession))
    return "The parent path contains control characters. Once idle, run /sesh create-empty-child.";
  // POSIX quoting is wrong for cmd.exe and PowerShell.
  if (process.platform === "win32") return "Once idle, run /sesh create-empty-child.";

  return `To create a child session in another terminal, run:\npi --parent-session ${quotePosixShellArgument(parentSession)}`;
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
    ctx.ui.notify("Run /sesh persist before creating a child session.", "error");

    return;
  }

  // Pi assigns a file path before writing it. A child must not point to a nonexistent parent.
  if (!existsSync(parentSession)) {
    ctx.ui.notify(
      "The parent session has not been saved yet. Send a message before creating a child session.",
      "error"
    );

    return;
  }

  const result = await ctx.newSession({
    parentSession,
    withSession: async (replacementCtx) => {
      replacementCtx.ui.notify("Created an empty child session.", "info");
    }
  });
  if (result.cancelled) ctx.ui.notify("Child session creation cancelled.", "info");
}

const subcommands = [
  { value: "persist", description: "Save this ephemeral session to disk" },
  {
    value: "create-empty-child",
    description: "Start an empty child of this saved session"
  },
  { value: "auto-name", description: "Regenerate the session title" }
];
const titleSubcommands = [{ value: "auto-name clear", description: "Clear the session title" }];

export function registerSessionCommand(
  pi: Pick<ExtensionAPI, "registerCommand">,
  autoName: (args: string) => Promise<void>
): void {
  let running = false;
  pi.registerCommand("sesh", {
    description:
      "Save ephemeral sessions, create empty child sessions, or generate and clear titles",
    getArgumentCompletions: (prefix) => {
      const choices = prefix.startsWith("auto-name ") ? titleSubcommands : subcommands;
      const matches = choices.filter(({ value }) => value.startsWith(prefix) && value !== prefix);

      return matches.length
        ? matches.map(({ value, description }) => ({ value, label: value, description }))
        : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim();

      // Naming can supersede or clear pending generation, even during a session operation.
      if (/^auto-name(?:\s|$)/u.test(action)) {
        await autoName(action.slice("auto-name".length).trim());

        return;
      }

      if (running) {
        ctx.ui.notify("A session operation is already in progress.", "warning");

        return;
      }

      running = true;

      try {
        switch (action) {
          case "persist":
            await persistSession(ctx);
            break;
          case "create-empty-child":
            await createEmptyChild(ctx);
            break;
          default:
            ctx.ui.notify(
              "Usage: /sesh persist | /sesh create-empty-child | /sesh auto-name [clear]",
              "error"
            );
        }
      } finally {
        running = false;
      }
    }
  });
}
