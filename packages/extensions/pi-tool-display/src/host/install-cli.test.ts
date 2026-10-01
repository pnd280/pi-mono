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
    const assistant = fileURLToPath(new URL("./assistant.ts", import.meta.url));
    const compatibility = fileURLToPath(new URL("./compatibility.ts", import.meta.url));
    const selectiveAdapter = fileURLToPath(
      new URL("../adapters/pi-read/index.ts", import.meta.url)
    );
    const selectiveExtension = fileURLToPath(
      new URL("../../../pi-read/index.ts", import.meta.url)
    );
    const boundedDiff = fileURLToPath(
      new URL("../../../../libs/src/bounded-diff/index.ts", import.meta.url)
    );
    const fixture = join(directory, "verify-display.ts");
    await writeFile(
      fixture,
      `
      import { AgentSession, AssistantMessageComponent, initTheme } from "@earendil-works/pi-coding-agent";
      import { installHostIntegration } from ${JSON.stringify(integration)};
      import { assistantBoundaryKind, bindAssistantPresentation, trackThinkingCompletion } from ${JSON.stringify(assistant)};
      import { interactivePrototype, modeHooksCompatible, rowContractCompatible } from ${JSON.stringify(compatibility)};
      import { createBoundedPatch } from ${JSON.stringify(boundedDiff)};
      import { piSelectiveReadAdapter } from ${JSON.stringify(selectiveAdapter)};
      const original = Reflect.get(AgentSession.prototype, "_buildRuntime");
      const dispose = installHostIntegration();
      const recognized = Reflect.get(AgentSession.prototype, "_buildRuntime") !== original;
      dispose?.();
      const restored = Reflect.get(AgentSession.prototype, "_buildRuntime") === original;
      export default function (pi) {
        pi.registerCommand("verify-display", { handler: async () => {
          initTheme("dark", false);
          const thought = { content: [{ type: "thinking", thinking: "retained thought" }], stopReason: "stop" };
          const component = new AssistantMessageComponent(undefined, true);
          const release = bindAssistantPresentation(component, () => {});
          component.updateContent(thought, true);
          const thinkingLive = component.render(80).join(" ").includes("Thinking...");
          trackThinkingCompletion(component, { type: "thinking_end", contentIndex: 0, content: "retained thought", partial: thought });
          component.updateContent(thought, true);
          const suppressed = component.render(80).length === 0 && assistantBoundaryKind(component) === undefined;
          component.setHideThinkingBlock(false);
          const revealed = component.render(80).join(" ").includes("retained thought");
          const thinkingBoundary = assistantBoundaryKind(component);
          component.setHideThinkingBlock(true);
          release?.();
          const thinkingRestored = component.render(80).join(" ").includes("Thinking...");
          const prose = new AssistantMessageComponent({ content: [{ type: "text", text: "Retained prose" }], stopReason: "stop" });
          const releaseProse = bindAssistantPresentation(prose, () => {});
          const proseMarked = prose.render(80).join(" ").includes("•");
          const proseBoundary = assistantBoundaryKind(prose);
          releaseProse?.();
          const proseRestored = !prose.render(80).join(" ").includes("•") && prose.render(80).join(" ").includes("Retained prose");
          const selectiveReadRecognized = piSelectiveReadAdapter(pi.getAllTools().find(tool => tool.name === "read"))?.id === "pi-read:read";
          const patch = await createBoundedPatch({ path: "file", before: "before\\n", after: "after\\n", maxSourceBytes: 1024, maxPatchBytes: 1024, maxEditLength: 2000, timeoutMs: 1000, contextLines: 4 });
          const generatedPatch = patch.status === "ready";
          const modeHooks = modeHooksCompatible(interactivePrototype());
          const rowContract = rowContractCompatible();
          process.stdout.write(JSON.stringify({ recognized, restored, thinkingLive, suppressed, revealed, thinkingBoundary, thinkingRestored, proseMarked, proseBoundary, proseRestored, selectiveReadRecognized, generatedPatch, modeHooks, rowContract }) + "\\n");
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
        selectiveExtension,
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
        thinkingLive: true,
        suppressed: true,
        revealed: true,
        thinkingBoundary: "group",
        thinkingRestored: true,
        proseMarked: true,
        proseBoundary: "run",
        proseRestored: true,
        selectiveReadRecognized: true,
        generatedPatch: true,
        modeHooks: true,
        rowContract: true
      })
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
