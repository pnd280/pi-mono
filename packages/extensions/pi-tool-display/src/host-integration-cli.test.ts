import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it } from "vite-plus/test";

import { record } from "./presentation.ts";

it("recognizes native construction through the installed pi executable, not just its unbundled API", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-cli-contract-"));

  try {
    const packageDirectory = dirname(
      dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")))
    );
    const manifest: unknown = JSON.parse(
      await readFile(join(packageDirectory, "package.json"), "utf8")
    );
    const executable = record(record(manifest).bin).pi;
    if (typeof executable !== "string")
      throw new Error("Installed Pi package has no bin.pi executable.");
    const integration = fileURLToPath(new URL("./host-integration.ts", import.meta.url));
    const fixture = join(directory, "verify-display.ts");
    await writeFile(
      fixture,
      `
      import { AgentSession } from "@earendil-works/pi-coding-agent";
      import { installHostIntegration } from ${JSON.stringify(integration)};
      const original = Reflect.get(AgentSession.prototype, "_buildRuntime");
      const dispose = installHostIntegration();
      const recognized = Reflect.get(AgentSession.prototype, "_buildRuntime") !== original;
      dispose?.();
      const restored = Reflect.get(AgentSession.prototype, "_buildRuntime") === original;
      export default function (pi) {
        pi.registerCommand("verify-display", { handler: async () => {
          process.stdout.write(JSON.stringify({ recognized, restored }) + "\\n");
        } });
      }
    `
    );
    const execution = promisify(execFile)(
      process.execPath,
      [
        join(packageDirectory, executable),
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
    expect(stdout + stderr).toContain(JSON.stringify({ recognized: true, restored: true }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
