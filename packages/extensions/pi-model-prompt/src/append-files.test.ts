import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { loadAppendFiles, resolveAppendReplacement } from "./append-files.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture(files: {
  project?: Record<string, string>;
  agent?: Record<string, string>;
}) {
  const root = await mkdtemp(join(tmpdir(), "pi-model-prompt-files-"));
  directories.push(root);
  const projectDir = join(root, "project", ".pi");
  const agentDir = join(root, "agent");
  await mkdir(projectDir, { recursive: true });
  await mkdir(agentDir);

  for (const [name, text] of Object.entries(files.project ?? {})) {
    await writeFile(join(projectDir, name), text);
  }

  for (const [name, text] of Object.entries(files.agent ?? {})) {
    await writeFile(join(agentDir, name), text);
  }

  return { projectDir, agentDir };
}

it("uses scope-first precedence for trusted projects", async () => {
  const { projectDir, agentDir } = await fixture({
    project: { "APPEND_SYSTEM.md": "project base", "APPEND_SYSTEM.a.md": "project a" },
    agent: {
      "APPEND_SYSTEM.md": "agent base",
      "APPEND_SYSTEM.a.md": "agent a",
      "APPEND_SYSTEM.b.md": "agent b"
    }
  });
  const files = loadAppendFiles({ projectDir, agentDir, variants: ["a", "b"] });

  expect(files.base).toBe("project base");
  expect(files.warnings).toEqual([]);
  expect(resolveAppendReplacement(files, "project base", "a")).toBe("project a");
  // The project's own base outranks personal agent-level variants.
  expect(resolveAppendReplacement(files, "project base", "b")).toBeUndefined();
});

it("uses a project variant when only the agent has a base file", async () => {
  const { projectDir, agentDir } = await fixture({
    project: { "APPEND_SYSTEM.a.md": "project a" },
    agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.a.md": "agent a" }
  });
  const files = loadAppendFiles({ projectDir, agentDir, variants: ["a"] });

  expect(files.base).toBe("agent base");
  expect(files.warnings).toEqual([]);
  expect(resolveAppendReplacement(files, "agent base", "a")).toBe("project a");
});

it("falls back to the project base rather than an agent variant after a bad project variant", async () => {
  const { projectDir, agentDir } = await fixture({
    project: { "APPEND_SYSTEM.md": "project base" },
    agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.a.md": "agent a" }
  });
  const variantPath = join(projectDir, "APPEND_SYSTEM.a.md");
  await mkdir(variantPath);
  const files = loadAppendFiles({ projectDir, agentDir, variants: ["a"] });

  expect(files.base).toBe("project base");
  expect(files.warnings).toEqual([`${variantPath} could not be read; falling back`]);
  expect(resolveAppendReplacement(files, "project base", "a")).toBeUndefined();
});

it("ignores project files for untrusted projects", async () => {
  const { agentDir } = await fixture({
    project: { "APPEND_SYSTEM.md": "project base", "APPEND_SYSTEM.a.md": "project a" },
    agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.a.md": "agent a" }
  });
  const files = loadAppendFiles({ projectDir: undefined, agentDir, variants: ["a"] });

  expect(files.base).toBe("agent base");
  expect(resolveAppendReplacement(files, "agent base", "a")).toBe("agent a");
});

it("applies variants without a base file and strips a byte-order mark like Pi", async () => {
  const { agentDir } = await fixture({ agent: { "APPEND_SYSTEM.a.md": "\uFEFFagent a" } });
  const files = loadAppendFiles({ projectDir: undefined, agentDir, variants: ["a"] });

  expect(files.base).toBe("");
  expect(resolveAppendReplacement(files, "", "a")).toBe("agent a");
});

it("strips the base byte-order mark and preserves empty variants and exact whitespace", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "\uFEFFbase\r\n",
      "APPEND_SYSTEM.empty.md": "",
      "APPEND_SYSTEM.exact.md": "  variant\r\n"
    }
  });
  const files = loadAppendFiles({ projectDir: undefined, agentDir, variants: ["empty", "exact"] });

  expect(files.base).toBe("base\r\n");
  expect(resolveAppendReplacement(files, "base\r\n", "empty")).toBe("");
  expect(resolveAppendReplacement(files, "base\r\n", "exact")).toBe("  variant\r\n");
});

it("leaves non-file append text and unmatched models unchanged", async () => {
  const { agentDir } = await fixture({
    agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.a.md": "agent a" }
  });
  const files = loadAppendFiles({ projectDir: undefined, agentDir, variants: ["a"] });

  expect(resolveAppendReplacement(files, "from --append-system-prompt", "a")).toBeUndefined();
  expect(resolveAppendReplacement(files, "agent base", undefined)).toBeUndefined();
});

it("warns for missing or unreadable variants and falls back", async () => {
  const { projectDir, agentDir } = await fixture({
    agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.b.md": "agent b" }
  });
  await mkdir(join(projectDir, "APPEND_SYSTEM.b.md"));
  const files = loadAppendFiles({ projectDir, agentDir, variants: ["missing", "b"] });

  expect(files.warnings).toEqual([
    "no APPEND_SYSTEM.missing.md found; using APPEND_SYSTEM.md",
    `${join(projectDir, "APPEND_SYSTEM.b.md")} could not be read; falling back`
  ]);
  expect(resolveAppendReplacement(files, "agent base", "missing")).toBeUndefined();
  expect(resolveAppendReplacement(files, "agent base", "b")).toBe("agent b");
});

it.skipIf(process.platform === "win32")(
  "falls back from FIFO variants without blocking startup",
  async () => {
    const { projectDir, agentDir } = await fixture({
      agent: { "APPEND_SYSTEM.md": "agent base", "APPEND_SYSTEM.a.md": "agent a" }
    });
    const fifo = join(projectDir, "APPEND_SYSTEM.a.md");
    execFileSync("mkfifo", [fifo]);

    // Isolate the synchronous read so a blocking regression cannot hang the test runner.
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
    import { loadAppendFiles, resolveAppendReplacement } from ${JSON.stringify(new URL("./append-files.ts", import.meta.url).href)};
    const files = loadAppendFiles(${JSON.stringify({ projectDir, agentDir, variants: ["a"] })});
    process.stdout.write(JSON.stringify({
      warnings: files.warnings,
      replacement: resolveAppendReplacement(files, "agent base", "a")
    }));
  `
      ],
      { encoding: "utf8", timeout: 2000 }
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      warnings: [`${fifo} could not be read; falling back`],
      replacement: "agent a"
    });
  }
);

it("disables replacement when the base file cannot be read", async () => {
  const { agentDir } = await fixture({ agent: { "APPEND_SYSTEM.a.md": "agent a" } });
  await mkdir(join(agentDir, "APPEND_SYSTEM.md"));
  const files = loadAppendFiles({ projectDir: undefined, agentDir, variants: ["a"] });

  expect(files.base).toBeUndefined();
  expect(files.warnings).toEqual([
    `${join(agentDir, "APPEND_SYSTEM.md")} could not be read; variants disabled`
  ]);
  expect(resolveAppendReplacement(files, "", "a")).toBeUndefined();
});
