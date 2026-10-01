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

  return { projectDir, agentDir, at: (name: string) => join(agentDir, name) };
}

it("discovers the base like Pi: trusted project file first, then agent file", async () => {
  const { projectDir, agentDir } = await fixture({
    project: { "APPEND_SYSTEM.md": "project base" },
    agent: { "APPEND_SYSTEM.md": "agent base" }
  });

  expect(loadAppendFiles({ projectDir, agentDir, paths: [] }).base).toBe("project base");
  expect(loadAppendFiles({ projectDir: undefined, agentDir, paths: [] }).base).toBe("agent base");
});

it("joins files in listed order with Pi's separator, reusing repeated files", async () => {
  const { agentDir, at } = await fixture({
    agent: { "APPEND_SYSTEM.md": "base", "a.md": "A", "b.md": "B" }
  });
  const files = loadAppendFiles({
    projectDir: undefined,
    agentDir,
    paths: [at("a.md"), at("b.md")]
  });

  expect(files.warnings).toEqual([]);
  expect(resolveAppendReplacement(files, "base", [at("b.md"), at("a.md")])).toBe("B\n\nA");
  expect(resolveAppendReplacement(files, "base", [at("a.md"), at("b.md"), at("a.md")])).toBe(
    "A\n\nB\n\nA"
  );
  expect(resolveAppendReplacement(files, "base", undefined)).toBeUndefined();
});

it("applies files without a base file and strips a byte-order mark like Pi", async () => {
  const { agentDir, at } = await fixture({ agent: { "a.md": "\uFEFFagent a" } });
  const files = loadAppendFiles({ projectDir: undefined, agentDir, paths: [at("a.md")] });

  expect(files.base).toBe("");
  expect(resolveAppendReplacement(files, "", [at("a.md")])).toBe("agent a");
});

it("strips the base byte-order mark and preserves empty lists, empty files, and whitespace", async () => {
  const { agentDir, at } = await fixture({
    agent: { "APPEND_SYSTEM.md": "\uFEFFbase\r\n", "empty.md": "", "exact.md": "  variant\r\n" }
  });
  const files = loadAppendFiles({
    projectDir: undefined,
    agentDir,
    paths: [at("empty.md"), at("exact.md")]
  });

  expect(files.base).toBe("base\r\n");
  expect(resolveAppendReplacement(files, "base\r\n", [])).toBe("");
  expect(resolveAppendReplacement(files, "base\r\n", [at("empty.md")])).toBe("");
  expect(resolveAppendReplacement(files, "base\r\n", [at("exact.md")])).toBe("  variant\r\n");
});

it("keeps the base text for rules listing missing or unreadable files", async () => {
  const { agentDir, at } = await fixture({ agent: { "APPEND_SYSTEM.md": "base", "a.md": "A" } });
  await mkdir(at("dir.md"));
  const files = loadAppendFiles({
    projectDir: undefined,
    agentDir,
    paths: [at("a.md"), at("missing.md"), at("dir.md")]
  });

  expect(files.warnings).toEqual([
    `${at("missing.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`,
    `${at("dir.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`
  ]);
  expect(resolveAppendReplacement(files, "base", [at("a.md")])).toBe("A");
  expect(resolveAppendReplacement(files, "base", [at("a.md"), at("missing.md")])).toBeUndefined();
  expect(resolveAppendReplacement(files, "base", [at("dir.md")])).toBeUndefined();
});

it.skipIf(process.platform === "win32")("rejects FIFO files without blocking startup", async () => {
  const { agentDir, at } = await fixture({ agent: { "APPEND_SYSTEM.md": "base" } });
  const fifo = at("fifo.md");
  execFileSync("mkfifo", [fifo]);

  // Isolate the synchronous read so a blocking regression cannot hang the test runner.
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { loadAppendFiles, resolveAppendReplacement } from ${JSON.stringify(new URL("./append-files.ts", import.meta.url).href)};
    const files = loadAppendFiles(${JSON.stringify({ agentDir, paths: [fifo] })});
    process.stdout.write(JSON.stringify({
      warnings: files.warnings,
      replacement: resolveAppendReplacement(files, "base", ${JSON.stringify([fifo])}) ?? null
    }));
  `
    ],
    { encoding: "utf8", timeout: 2000 }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    warnings: [`${fifo} could not be read; rules listing it keep APPEND_SYSTEM.md`],
    replacement: null
  });
});

it("disables replacement when the base file cannot be read", async () => {
  const { agentDir, at } = await fixture({ agent: { "a.md": "A" } });
  await mkdir(at("APPEND_SYSTEM.md"));
  const files = loadAppendFiles({ projectDir: undefined, agentDir, paths: [at("a.md")] });

  expect(files.base).toBeUndefined();
  expect(files.warnings).toEqual([
    `${at("APPEND_SYSTEM.md")} could not be read; replacement disabled`
  ]);
  expect(resolveAppendReplacement(files, "", [at("a.md")])).toBeUndefined();
});
