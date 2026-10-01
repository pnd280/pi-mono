import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

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

it.each([undefined, "{}"])(
  "leaves append text unchanged without configured rules (%s)",
  async (settings) => {
    const { agentDir } = await fixture({
      agent: {
        "APPEND_SYSTEM.md": "base",
        ...(settings === undefined ? {} : { "settings.json": settings })
      }
    });
    const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.replacementFor("p/model", "base")).toBeUndefined();
  }
);

it("selects the first matching rule that sets append, using unanchored case-sensitive regex", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "ant.md": "ANT",
      "gpt.md": "GPT",
      "main.md": "MAIN",
      "settings.json": withRules([
        { match: "opus" },
        { match: "claude", append: ["ant.md"] },
        { match: "^openai-codex/gpt-6-(astra|sol)$", append: ["gpt.md", "main.md"] },
        { match: "gpt", append: ["gpt.md"] },
        { match: ".", append: [] },
        { match: ".", append: ["main.md"] }
      ])
    }
  });
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.replacementFor("cpa-ant/claude-opus-5-5", "base")).toBe("ANT");
  expect(snapshot.replacementFor("openai-codex/gpt-6-sol", "base")).toBe("GPT\n\nMAIN");
  expect(snapshot.replacementFor("openai-codex/gpt-6-luna", "base")).toBe("GPT");
  expect(snapshot.replacementFor("x/CLAUDE", "base")).toBe("");
  expect(snapshot.replacementFor("", "base")).toBeUndefined();
});

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

it("skips invalid rules without loading their files and keeps valid ones", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "ant.md": "ANT",
      "settings.json": withRules([
        { match: "(", append: ["broken.md"] },
        { match: "a", append: "ant.md" },
        { match: "a", append: [""] },
        { match: "a", append: ["x.md"], extra: true },
        { match: "", append: ["empty.md"] },
        "claude",
        { match: "claude", append: ["ant.md"] }
      ])
    }
  });
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.warnings).toHaveLength(6);
  expect(snapshot.warnings.every((warning) => warning.startsWith("rules["))).toBe(true);
  expect(snapshot.replacementFor("p/claude", "base")).toBe("ANT");
});

it("enforces rule, pattern, file-count, and path limits without truncating input", async () => {
  const match = "a".repeat(512);
  const path = `/${"p".repeat(4095)}`;
  const append = Array.from({ length: 32 }, (_, index) => `${index}.md`);
  const rules = [
    { match, append },
    ...Array.from({ length: 99 }, () => ({ match: "b", append: [path] }))
  ];
  const { agentDir, at } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "settings.json": withRules(rules),
      ...Object.fromEntries(append.map((name, index) => [name, String(index)]))
    }
  });
  const accepted = loadModelPromptSnapshot({ agentDir, projectDir: undefined });
  expect(accepted.replacementFor(match, "base")).toBe(
    Array.from({ length: 32 }, (_, index) => String(index)).join("\n\n")
  );
  expect(accepted.replacementFor("b", "base")).toBeUndefined();
  // A 4096-character path cannot be read, but this complete file warning proves schema acceptance.
  expect(accepted.warnings).toEqual([
    `${path} could not be read; rules listing it keep APPEND_SYSTEM.md`
  ]);

  await writeFile(at("settings.json"), withRules([...rules, { match }]));
  const tooMany = loadModelPromptSnapshot({ agentDir, projectDir: undefined });
  expect(tooMany.replacementFor(match, "base")).toBeUndefined();
  expect(tooMany.warnings).toEqual([
    "ext.pi-model-prompt is invalid; expected only rules (at most 100); rules disabled"
  ]);

  await writeFile(
    at("settings.json"),
    withRules([
      { match: `${match}a`, append },
      { match, append: [`${path}p`] },
      { match, append: [...append, "extra.md"] }
    ])
  );
  const tooLong = loadModelPromptSnapshot({ agentDir, projectDir: undefined });
  expect(tooLong.replacementFor(match, "base")).toBeUndefined();
  expect(tooLong.warnings).toHaveLength(3);
  expect(tooLong.warnings.every((warning) => warning.startsWith("rules["))).toBe(true);
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

it.each([JSON.stringify({ "ext.pi-model-prompt": { rules: "claude" } }), "{"])(
  "disables rules for invalid sections or unreadable settings (%s)",
  async (settings) => {
    const { agentDir } = await fixture({
      agent: { "APPEND_SYSTEM.md": "base", "settings.json": settings }
    });
    const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

    expect(snapshot.replacementFor("p/claude", "base")).toBeUndefined();
    expect(snapshot.warnings).toHaveLength(1);
  }
);

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

it("joins files in listed order, reusing repeated files and suppressing unchanged text", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "base",
      "a.md": "A",
      "b.md": "B",
      "same.md": "base",
      "settings.json": withRules([
        { match: "^reverse$", append: ["b.md", "a.md"] },
        { match: "^repeat$", append: ["a.md", "b.md", "a.md"] },
        { match: "^same$", append: ["same.md"] }
      ])
    }
  });
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.warnings).toEqual([]);
  expect(snapshot.replacementFor("reverse", "base")).toBe("B\n\nA");
  expect(snapshot.replacementFor("repeat", "base")).toBe("A\n\nB\n\nA");
  expect(snapshot.replacementFor("unmatched", "base")).toBeUndefined();
  expect(snapshot.replacementFor("same", "base")).toBeUndefined();
  expect(snapshot.replacementFor("repeat", "explicit append")).toBeUndefined();
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

it("strips the base byte-order mark and preserves empty lists, empty files, and whitespace", async () => {
  const { agentDir } = await fixture({
    agent: {
      "APPEND_SYSTEM.md": "\uFEFFbase\r\n",
      "empty.md": "",
      "exact.md": "  variant\r\n",
      "settings.json": withRules([
        { match: "^list$", append: [] },
        { match: "^file$", append: ["empty.md"] },
        { match: "^exact$", append: ["exact.md"] }
      ])
    }
  });
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.replacementFor("list", "base\r\n")).toBe("");
  expect(snapshot.replacementFor("file", "base\r\n")).toBe("");
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

it("loads all configured rules once and orders settings, base, and unique-file warnings", async () => {
  const { agentDir, at } = await fixture({
    agent: {
      "settings.json": withRules([
        { match: "(", append: ["invalid.md"] },
        { match: "current", append: ["missing.md", "missing.md"] },
        { match: "unmatched", append: ["missing.md", "other.md"] }
      ])
    }
  });
  await mkdir(at("APPEND_SYSTEM.md"));
  await mkdir(at("unconfigured.md"));
  const snapshot = loadModelPromptSnapshot({ agentDir, projectDir: undefined });

  expect(snapshot.warnings).toEqual([
    "rules[0] skipped: invalid regular expression",
    `${at("APPEND_SYSTEM.md")} could not be read; replacement disabled`,
    `${at("missing.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`,
    `${at("other.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`
  ]);
  expect(snapshot.replacementFor("current", "")).toBeUndefined();
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
    { encoding: "utf8", timeout: 2000 }
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
