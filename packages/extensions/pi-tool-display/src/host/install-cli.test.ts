import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  createPiLaunch,
  createValidationWorkspace,
  STEP_TIMEOUT_MS
} from "@pi-mono/libs/validation/pi-process";
import { expect, it } from "vite-plus/test";

it("recognizes native construction through the installed pi executable, not just its unbundled API", async () => {
  const directory = await createValidationWorkspace("display-cli-contract-");

  try {
    const integration = fileURLToPath(new URL("./install.ts", import.meta.url));
    const collection = fileURLToPath(new URL("./collection.ts", import.meta.url));
    const compatibility = fileURLToPath(new URL("./compatibility.ts", import.meta.url));
    const fixture = join(directory, "work", "verify-display.ts");
    await writeFile(
      fixture,
      `
      import { AgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
      import { installHostIntegration } from ${JSON.stringify(integration)};
      import { DisplayCollectors } from ${JSON.stringify(collection)};
      import { interactivePrototype } from ${JSON.stringify(compatibility)};
      const original = Reflect.get(AgentSession.prototype, "_buildRuntime");
      const host = interactivePrototype();
      const lookup = host.getRegisteredToolDefinition;
      // Pi's lookup has no definition for an unregistered tool; the installed hook gives it a generic card.
      const lookupHost = { session: {
        settingsManager: SettingsManager.inMemory(),
        sessionManager: SessionManager.inMemory(process.cwd()),
        getToolDefinition: () => undefined,
        getAllTools: () => [],
        extensionRunner: { resolveToolRenderers: (_name, base) => base() }
      } };
      const lookupShell = () => host.getRegisteredToolDefinition.call(lookupHost, "unregistered")?.renderShell;
      const collection = new DisplayCollectors();
      const dispose = installHostIntegration(collection);
      const hostInstalled = typeof dispose === "function" && host.getRegisteredToolDefinition !== lookup && lookupShell() === "self";
      const recognized = Reflect.get(AgentSession.prototype, "_buildRuntime") !== original;
      dispose?.();
      collection.dispose();
      const hostRestored = host.getRegisteredToolDefinition === lookup && lookupShell() === undefined;
      const restored = Reflect.get(AgentSession.prototype, "_buildRuntime") === original;
      export default function (pi) {
        pi.registerCommand("verify-display", { handler: async () => {
          process.stdout.write(JSON.stringify({ hostInstalled, hostRestored, recognized, restored }) + "\\n");
        } });
      }
    `
    );
    const launch = await createPiLaunch({
      directory,
      args: [
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-session",
        "-e",
        fixture,
        "--print",
        "/verify-display"
      ]
    });
    const execution = promisify(execFile)(launch.command, launch.args, {
      ...launch.options,
      timeout: STEP_TIMEOUT_MS
    });
    execution.child.stdin?.end();
    const { stdout, stderr } = await execution;
    const report = (stdout + stderr)
      .split("\n")
      .find((line) => line.startsWith("{") && line.includes('"recognized"'));
    expect(JSON.parse(report ?? "null")).toEqual({
      hostInstalled: true,
      hostRestored: true,
      recognized: true,
      restored: true
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
