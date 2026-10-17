import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { loadModelPromptSnapshot } from "./model-prompt.ts";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture(files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "pi-model-prompt-snapshot-"));
  directories.push(root);
  const agentDir = join(root, "agent");
  await mkdir(agentDir);

  for (const [name, text] of Object.entries(files)) {
    const path = join(agentDir, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }

  return { agentDir, at: (name: string) => join(agentDir, name) };
}

const withRules = (rules: unknown) => JSON.stringify({ "ext.pi-model-prompt": { rules } });

it("does not echo supplied settings keys or values in validation warnings", async () => {
  const privateKey = "PRIVATE-SETTING\n\u001b[31m";
  const privateValue = "PRIVATE-VALUE\n\u001b[32m";

  for (const settings of [
    withRules([{ match: "claude", [privateKey]: privateValue }]),
    JSON.stringify({ "ext.pi-model-prompt": { [privateKey]: privateValue } })
  ]) {
    const { agentDir } = await fixture({ "settings.json": settings });
    const snapshot = loadModelPromptSnapshot(agentDir);

    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.warnings[0]).not.toContain("PRIVATE-SETTING");
    expect(snapshot.warnings[0]).not.toContain("PRIVATE-VALUE");
    expect(snapshot.warnings[0]).not.toContain("\u001b");
  }
});

it("adds nothing for failed first selections without falling through to later rules", async () => {
  const { agentDir, at } = await fixture({
    "a.md": "A",
    "settings.json": withRules([
      { match: "^missing$", append: ["a.md", "missing.md"] },
      { match: "^directory$", append: ["dir.md"] },
      { match: ".", append: ["a.md"] }
    ])
  });
  await mkdir(at("dir.md"));
  const snapshot = loadModelPromptSnapshot(agentDir);

  expect(snapshot.appendTextFor("missing", "base")).toBeUndefined();
  expect(snapshot.appendTextFor("directory", "base")).toBeUndefined();
});
