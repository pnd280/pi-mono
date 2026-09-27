import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { loadModelPromptConfig, referencedVariants, selectAppendVariant } from "./config.ts";

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
  const { rules, warnings } = loadModelPromptConfig(
    await agentDirWith(
      withRules([
        { match: "opus" },
        { match: "claude", append: "ant" },
        { match: "^openai-codex/gpt-6-(astra|sol)$", append: "gpt-main" },
        { match: "gpt", append: "gpt" },
        { match: ".", append: "fallback" }
      ])
    )
  );

  expect(warnings).toEqual([]);
  expect(selectAppendVariant(rules, "cpa-ant/claude-opus-5-5")).toBe("ant");
  expect(selectAppendVariant(rules, "openai-codex/gpt-6-sol")).toBe("gpt-main");
  expect(selectAppendVariant(rules, "openai-codex/gpt-6-luna")).toBe("gpt");
  expect(selectAppendVariant(rules, "x/CLAUDE")).toBe("fallback");
  expect(selectAppendVariant(rules, "")).toBeUndefined();
  expect(referencedVariants(rules)).toEqual(["ant", "gpt-main", "gpt", "fallback"]);
});

it("skips invalid rules with warnings and keeps valid ones", async () => {
  const { rules, warnings } = loadModelPromptConfig(
    await agentDirWith(
      withRules([
        { match: "(", append: "broken" },
        { match: "a", append: "../escape" },
        { match: "a", append: "x", extra: true },
        { match: "", append: "empty" },
        "claude",
        { match: "claude", append: "ant" }
      ])
    )
  );

  expect(warnings).toHaveLength(5);
  expect(warnings[0]).toBe("rules[0] skipped: invalid regular expression");
  expect(warnings.slice(1).every((warning) => /^rules\[[1-4]\] skipped: /u.test(warning))).toBe(
    true
  );
  expect(selectAppendVariant(rules, "p/claude")).toBe("ant");
  expect(referencedVariants(rules)).toEqual(["ant"]);
});

it("enforces rule, pattern, and variant limits without truncating input", async () => {
  const match = "a".repeat(512);
  const append = "v".repeat(64);
  const rules = Array.from({ length: 100 }, () => ({ match, append }));
  const accepted = loadModelPromptConfig(await agentDirWith(withRules(rules)));
  expect(accepted.warnings).toEqual([]);
  expect(selectAppendVariant(accepted.rules, match)).toBe(append);
  expect(referencedVariants(accepted.rules)).toEqual([append]);

  const tooMany = loadModelPromptConfig(await agentDirWith(withRules([...rules, { match }])));
  expect(tooMany.rules).toEqual([]);
  expect(tooMany.warnings).toHaveLength(1);

  const tooLong = loadModelPromptConfig(
    await agentDirWith(
      withRules([
        { match: `${match}a`, append },
        { match, append: `${append}v` }
      ])
    )
  );
  expect(tooLong.rules).toEqual([]);
  expect(tooLong.warnings).toHaveLength(2);
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
