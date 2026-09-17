import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolvePiExecutable } from "@pi-mono/libs/validation/pi-process";
import { expect, it } from "vite-plus/test";

it("recognizes native construction through the installed pi executable, not just its unbundled API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-cli-contract-"));

  try {
    const executable = await resolvePiExecutable();
    const integration = fileURLToPath(new URL("./install.ts", import.meta.url));
    const thinking = fileURLToPath(new URL("./thinking.ts", import.meta.url));
    const fixture = join(directory, "verify-display.ts");
    await writeFile(
      fixture,
      `
      import { AgentSession, AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
      import { installHostIntegration } from ${JSON.stringify(integration)};
      import { bindThinkingVisibility } from ${JSON.stringify(thinking)};
      const original = Reflect.get(AgentSession.prototype, "_buildRuntime");
      const dispose = installHostIntegration();
      const recognized = Reflect.get(AgentSession.prototype, "_buildRuntime") !== original;
      dispose?.();
      const restored = Reflect.get(AgentSession.prototype, "_buildRuntime") === original;
      export default function (pi) {
        pi.registerCommand("verify-display", { handler: async () => {
          initTheme("dark", false);
          const component = new AssistantMessageComponent({ content: [{ type: "thinking", thinking: "retained thought" }], stopReason: "stop" }, true);
          const release = bindThinkingVisibility(component, () => {});
          const suppressed = component.render(80).length === 0;
          component.setHideThinkingBlock(false);
          const revealed = component.render(80).join(" ").includes("retained thought");
          component.setHideThinkingBlock(true);
          release?.();
          const thinkingRestored = component.render(80).join(" ").includes("Thinking...");
          process.stdout.write(JSON.stringify({ recognized, restored, suppressed, revealed, thinkingRestored }) + "\\n");
        } });
      }
    `
    );
    const execution = promisify(execFile)(
      process.execPath,
      [
        executable,
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-session",
        "-e",
        fixture,
        "--print",
        "/verify-display"
      ],
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          USERPROFILE: directory,
          PI_CODING_AGENT_DIR: join(directory, "agent"),
          PI_OFFLINE: "1"
        },
        timeout: 15_000
      }
    );
    execution.child.stdin?.end();
    const { stdout, stderr } = await execution;
    expect(stdout + stderr).toContain(
      JSON.stringify({
        recognized: true,
        restored: true,
        suppressed: true,
        revealed: true,
        thinkingRestored: true
      })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
