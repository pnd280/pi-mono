import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it } from "vite-plus/test";

import { loadModelPromptSnapshot } from "./model-prompt.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture(
  files: {
    project?: Record<string, string>;
    agent?: Record<string, string>;
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), "pi-model-prompt-snapshot-"));
  directories.push(root);
  const projectDir = join(root, "project", ".pi");
  const agentDir = join(root, "agent");
  await mkdir(projectDir, { recursive: true });
  await mkdir(agentDir);

  for (const [directory, contents] of [
    [projectDir, files.project ?? {}],
    [agentDir, files.agent ?? {}]
  ] as const) {
    for (const [name, text] of Object.entries(contents)) {
      const path = join(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    }
  }

  return { root, projectDir, agentDir, at: (name: string) => join(agentDir, name) };
}

const withRules = (rules: unknown) => JSON.stringify({ "ext.pi-model-prompt": { rules } });

it("expands home and resolves relative paths against the settings directory", async () => {
  const { root, agentDir, at } = await fixture({
    agent: { "APPEND_SYSTEM.md": "base", "prompts/two.md": "RELATIVE" }
  });
  const absolute = join(root, "one.md");
  const homeName = `${basename(root)}-missing.md`;
  await writeFile(absolute, "ABSOLUTE");
  await writeFile(join(root, "three.md"), "PARENT");
  await writeFile(
    at("settings.json"),
    withRules([
      { match: "a", append: [absolute, "prompts/two.md", "../three.md"] },
      { match: "home", append: [`~/${homeName}`] }
    ])
  );
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.replacementFor("a", "base")).toBe("ABSOLUTE\n\nRELATIVE\n\nPARENT");
  expect(snapshot.replacementFor("home", "base")).toBeUndefined();
  expect(snapshot.warnings).toEqual([
    `${join(homedir(), homeName)} could not be read; rules listing it keep APPEND_SYSTEM.md`
  ]);
});

it("does not echo unknown settings keys in validation warnings", async () => {
  const privateKey = "PRIVATE-SETTING\n\u001b[31m";

  for (const settings of [
    withRules([{ match: "claude", [privateKey]: true }]),
    JSON.stringify({ "ext.pi-model-prompt": { [privateKey]: true } })
  ]) {
    const { agentDir } = await fixture({
      agent: { "APPEND_SYSTEM.md": "base", "settings.json": settings }
    });
    const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

    expect(snapshot.replacementFor("p/claude", "base")).toBeUndefined();
    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.warnings[0]).not.toContain("PRIVATE-SETTING");
    expect(snapshot.warnings[0]).not.toContain("\u001b");
  }
});

it("discovers the base like Pi: trusted project file first, then agent file", async () => {
  const { projectDir, agentDir } = await fixture({
    project: { "APPEND_SYSTEM.md": "project base" },
    agent: {
      "APPEND_SYSTEM.md": "agent base",
      "a.md": "A",
      "settings.json": withRules([{ match: ".", append: ["a.md"] }])
    }
  });
  const trusted = loadModelPromptSnapshot({ projectDir, agentDir });
  const untrusted = loadModelPromptSnapshot({ projectDir: undefined, agentDir });

  expect(trusted.replacementFor("p/model", "project base")).toBe("A");
  expect(trusted.replacementFor("p/model", "agent base")).toBeUndefined();
  expect(untrusted.replacementFor("p/model", "agent base")).toBe("A");
  expect(untrusted.replacementFor("p/model", "project base")).toBeUndefined();
  await rm(join(projectDir, "APPEND_SYSTEM.md"));
  expect(
    loadModelPromptSnapshot({ projectDir, agentDir }).replacementFor("p/model", "agent base")
  ).toBe("A");
});

it.each([undefined, ""])(
  "applies files with a missing or empty base (%s) and strips a byte-order mark like Pi",
  async (base) => {
    const { agentDir } = await fixture({
      agent: {
        ...(base === undefined ? {} : { "APPEND_SYSTEM.md": base }),
        "a.md": "\uFEFFagent a",
        "settings.json": withRules([{ match: ".", append: ["a.md"] }])
      }
    });
    const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.replacementFor("p/model", "")).toBe("agent a");
  }
);

it("compares append text with the loaded base after stripping its byte-order mark", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "\uFEFFbase\r\n",
      "exact.md": "  variant\r\n",
      "settings.json": withRules([{ match: "^exact$", append: ["exact.md"] }])
    }
  });
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.replacementFor("exact", "base\r\n")).toBe("  variant\r\n");
  expect(snapshot.replacementFor("exact", "\uFEFFbase\r\n")).toBeUndefined();
});

it("keeps the base for failed first selections without falling through to later rules", async () => {
  const { agentDir, at } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "a.md": "A",
      "settings.json": withRules([
        { match: "^valid$", append: ["a.md"] },
        { match: "^missing$", append: ["a.md", "missing.md"] },
        { match: "^directory$", append: ["dir.md"] },
        { match: ".", append: ["a.md"] }
      ])
    }
  });
  await mkdir(at("dir.md"));
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.warnings).toEqual([
    `${at("missing.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`,
    `${at("dir.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`
  ]);
  expect(snapshot.replacementFor("valid", "base")).toBe("A");
  expect(snapshot.replacementFor("missing", "base")).toBeUndefined();
  expect(snapshot.replacementFor("directory", "base")).toBeUndefined();
});

it.skipIf(process.platform === "win32")("rejects FIFO files without blocking startup", async () => {
  const { agentDir, at } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "settings.json": withRules([{ match: ".", append: ["fifo.md"] }])
    }
  });
  const fifo = at("fifo.md");
  execFileSync("mkfifo", [fifo]);

  // Isolate the synchronous read so a blocking regression cannot hang the test runner.
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { loadModelPromptSnapshot } from ${JSON.stringify(new URL("./model-prompt.ts", import.meta.url).href)};
    const snapshot = loadModelPromptSnapshot({ agentDir: ${JSON.stringify(agentDir)}, projectDir: undefined });
    process.stdout.write(JSON.stringify({
      warnings: snapshot.warnings,
      replacement: snapshot.replacementFor("p/model", "base") ?? null
    }));
  `
    ],
    { encoding: "utf8", timeout: STEP_TIMEOUT_MS }
  );

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const output: unknown = JSON.parse(result.stdout);
  expect(output).toHaveProperty(
    "warnings",
    expect.arrayContaining([expect.stringContaining(fifo)])
  );
  expect(output).toHaveProperty("replacement", null);
});

it("disables replacement when the base file cannot be read, even with an empty selection", async () => {
  const { projectDir, agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "agent base",
      "a.md": "A",
      "settings.json": withRules([
        { match: "^file$", append: ["a.md"] },
        { match: "^empty$", append: [] }
      ])
    }
  });
  await mkdir(join(projectDir, "APPEND_SYSTEM.md"));
  const snapshot = loadModelPromptSnapshot({ projectDir, agentDir });

  expect(snapshot.warnings).toEqual([
    `${join(projectDir, "APPEND_SYSTEM.md")} could not be read; replacement disabled`
  ]);
  expect(snapshot.replacementFor("file", "")).toBeUndefined();
  expect(snapshot.replacementFor("file", "agent base")).toBeUndefined();
  expect(snapshot.replacementFor("empty", "agent base")).toBeUndefined();
});
