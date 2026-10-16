import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  createPiLaunch,
  createValidationWorkspace,
  STEP_TIMEOUT_MS
} from "@pi-mono/libs/validation/pi-process";
import { it } from "vite-plus/test";
import { z } from "zod";

// Only host cancellation or the 15 s title deadline in `src/auto-title/generate.ts` releases a
// stalled title. A pending row must exit before that deadline, so its limit stays below 15 s.
const pendingExitMs = 14_000;

// Each row owns its workspace and process, so the CLI launches can overlap.
it.concurrent.for([
  { mode: "text", prompt: "Opening request", name: "Offline session title", state: "completed" },
  { mode: "json", prompt: "Opening request", name: "Offline session title", state: "completed" },
  { mode: "text", prompt: "stall-title", name: undefined, state: "pending" },
  { mode: "json", prompt: "stall-title", name: undefined, state: "pending" }
])(
  "keeps $mode output clean and exits with $state naming",
  async ({ mode, prompt, name, state }, { expect }) => {
    const directory = await createValidationWorkspace("pi-session-utils-auto-title-process-");
    const sessionPath = join(directory, "session.jsonl");

    try {
      await writeFile(
        join(directory, "agent", "settings.json"),
        JSON.stringify({
          "ext.pi-session-utils": {
            "auto-title": { model: "title-fixture/title", thinkingLevel: "off" }
          }
        })
      );
      const launch = await createPiLaunch({
        directory,
        args: [
          "--no-extensions",
          "--no-skills",
          "--no-themes",
          "--no-prompt-templates",
          "--no-context-files",
          "--no-tools",
          "-e",
          fileURLToPath(new URL("../index.ts", import.meta.url)),
          "-e",
          fileURLToPath(new URL("./auto-title-provider.ts", import.meta.url)),
          "--provider",
          "title-fixture",
          "--model",
          "active",
          "--thinking",
          "off",
          "--session",
          sessionPath,
          "--print",
          "--mode",
          mode,
          prompt
        ]
      });
      const execution = promisify(execFile)(launch.command, launch.args, {
        ...launch.options,
        timeout: state === "pending" ? pendingExitMs : STEP_TIMEOUT_MS
      });
      execution.child.stdin?.end();
      const { stdout, stderr } = await execution;
      expect(stderr).toBe("");

      if (mode === "text") expect(stdout.trim()).toBe("Fixture reply");
      else {
        const events = stdout
          .trim()
          .split("\n")
          .map((line) => {
            const event: unknown = JSON.parse(line);

            return z.object({ type: z.string(), name: z.string().optional() }).parse(event);
          });
        expect(events.some((event) => event.type === "agent_end")).toBe(true);
        expect(stdout).toContain("Fixture reply");
        expect(events.filter((event) => event.type === "session_info_changed")).toEqual(
          name ? [{ type: "session_info_changed", name }] : []
        );
      }

      expect(SessionManager.open(sessionPath).getSessionName()).toBe(name);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
