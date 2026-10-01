import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { loadModelPromptConfig, referencedFiles, selectAppendFiles } from "./config.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function agentDirWith(settings: string | undefined): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pi-model-prompt-config-"));
  directories.push(directory);
  if (settings !== undefined) await writeFile(join(directory, "settings.json"), settings);

  return directory;
}

const withRules = (rules: unknown) => JSON.stringify({ "ext.pi-model-prompt": { rules } });

it("has no rules or warnings without settings", async () => {
  expect(loadModelPromptConfig(await agentDirWith(undefined))).toEqual({ rules: [], warnings: [] });
  expect(loadModelPromptConfig(await agentDirWith("{}"))).toEqual({ rules: [], warnings: [] });
});

it("selects the first matching rule that sets append, using unanchored case-sensitive regex", async () => {
  const agentDir = await agentDirWith(
    withRules([
      { match: "opus" },
      { match: "claude", append: ["ant.md"] },
      { match: "^openai-codex/gpt-6-(astra|sol)$", append: ["gpt.md", "main.md"] },
      { match: "gpt", append: ["gpt.md"] },
      { match: ".", append: [] }
    ])
  );
  const { rules, warnings } = loadModelPromptConfig(agentDir);
  const at = (name: string) => join(agentDir, name);

  expect(warnings).toEqual([]);
  expect(selectAppendFiles(rules, "cpa-ant/claude-opus-5-5")).toEqual([at("ant.md")]);
  expect(selectAppendFiles(rules, "openai-codex/gpt-6-sol")).toEqual([at("gpt.md"), at("main.md")]);
  expect(selectAppendFiles(rules, "openai-codex/gpt-6-luna")).toEqual([at("gpt.md")]);
  expect(selectAppendFiles(rules, "x/CLAUDE")).toEqual([]);
  expect(selectAppendFiles(rules, "")).toBeUndefined();
  expect(referencedFiles(rules)).toEqual([at("ant.md"), at("gpt.md"), at("main.md")]);
});

it("expands home and resolves relative paths against the settings directory", async () => {
  const agentDir = await agentDirWith(
    withRules([
      { match: "a", append: ["/abs/one.md", "prompts/two.md", "../three.md", "~/four.md"] }
    ])
  );
  const { rules } = loadModelPromptConfig(agentDir);

  expect(selectAppendFiles(rules, "a")).toEqual([
    "/abs/one.md",
    join(agentDir, "prompts", "two.md"),
    join(agentDir, "..", "three.md"),
    join(homedir(), "four.md")
  ]);
});

it("skips invalid rules with warnings and keeps valid ones", async () => {
  const { rules, warnings } = loadModelPromptConfig(
    await agentDirWith(
      withRules([
        { match: "(", append: ["broken.md"] },
        { match: "a", append: "ant.md" },
        { match: "a", append: [""] },
        { match: "a", append: ["x.md"], extra: true },
        { match: "", append: ["empty.md"] },
        "claude",
        { match: "claude", append: ["/ant.md"] }
      ])
    )
  );

  expect(warnings).toHaveLength(6);
  expect(warnings[0]).toBe("rules[0] skipped: invalid regular expression");
  expect(warnings.slice(1).every((warning) => /^rules\[[1-5]\] skipped: /u.test(warning))).toBe(
    true
  );
  expect(selectAppendFiles(rules, "p/claude")).toEqual(["/ant.md"]);
  expect(referencedFiles(rules)).toEqual(["/ant.md"]);
});

it("enforces rule, pattern, file-count, and path limits without truncating input", async () => {
  const match = "a".repeat(512);
  const path = `/${"p".repeat(4095)}`;
  const append = Array.from({ length: 32 }, (_, index) => `/${index}.md`);
  const rules = [
    { match, append },
    ...Array.from({ length: 99 }, () => ({ match: "b", append: [path] }))
  ];
  const accepted = loadModelPromptConfig(await agentDirWith(withRules(rules)));
  expect(accepted.warnings).toEqual([]);
  expect(selectAppendFiles(accepted.rules, match)).toEqual(append);
  expect(selectAppendFiles(accepted.rules, "b")).toEqual([path]);

  const tooMany = loadModelPromptConfig(await agentDirWith(withRules([...rules, { match }])));
  expect(tooMany.rules).toEqual([]);
  expect(tooMany.warnings).toHaveLength(1);

  const tooLong = loadModelPromptConfig(
    await agentDirWith(
      withRules([
        { match: `${match}a`, append },
        { match, append: [`${path}p`] },
        { match, append: [...append, "/extra.md"] }
      ])
    )
  );
  expect(tooLong.rules).toEqual([]);
  expect(tooLong.warnings).toHaveLength(3);
});

it("does not echo unknown settings keys in validation warnings", async () => {
  const privateKey = "PRIVATE-SETTING\n\u001b[31m";
  const invalidRule = loadModelPromptConfig(
    await agentDirWith(withRules([{ match: "claude", [privateKey]: true }]))
  );
  const invalidSection = loadModelPromptConfig(
    await agentDirWith(JSON.stringify({ "ext.pi-model-prompt": { [privateKey]: true } }))
  );

  for (const config of [invalidRule, invalidSection]) {
    expect(config.rules).toEqual([]);
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0]).not.toContain("PRIVATE-SETTING");
    expect(config.warnings[0]).not.toContain("\u001b");
  }
});

it("disables rules for invalid sections or unreadable settings", async () => {
  const invalidSection = loadModelPromptConfig(
    await agentDirWith(JSON.stringify({ "ext.pi-model-prompt": { rules: "claude" } }))
  );
  expect(invalidSection.rules).toEqual([]);
  expect(invalidSection.warnings).toEqual([
    expect.stringContaining("ext.pi-model-prompt is invalid")
  ]);

  const malformed = loadModelPromptConfig(await agentDirWith("{"));
  expect(malformed).toEqual({
    rules: [],
    warnings: ["settings.json could not be read; rules disabled"]
  });
});
