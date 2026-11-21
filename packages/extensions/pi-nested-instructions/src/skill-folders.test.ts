import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, expect, it } from "vite-plus/test";

import { findSkillFolders } from "./skill-folders.ts";
import { fixture } from "./test-fixture.ts";

let fs: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  fs = await fixture();
});
afterEach(async () => {
  await fs.dispose();
});

it("never enters a symlinked directory and finds no skill folder through a link that leaves cwd", async () => {
  const skill = "---\nname: linked\ndescription: linked skill\n---\n";
  await fs.write("pkg/.agents/skills/local/SKILL.md", skill);
  await fs.write("../external/.agents/skills/outside/SKILL.md", skill);
  await fs.write("../external/inner/.agents/skills/outside/SKILL.md", skill);
  // The search skips dot directories, so only a followed link could reach this folder.
  await fs.write(".hidden/inner/.agents/skills/inside/SKILL.md", skill);
  // Directory links that leave cwd, loop back to cwd, and stay inside cwd, and a skill-folder link that leaves cwd.
  await symlink(path.join(fs.root, "external"), path.join(fs.cwd, "linked"));
  await symlink(fs.cwd, path.join(fs.cwd, "pkg/loop"));
  await symlink(path.join(fs.cwd, ".hidden/inner"), path.join(fs.cwd, "inner"));
  await mkdir(path.join(fs.cwd, "escape/.agents"), { recursive: true });
  await symlink(
    path.join(fs.root, "external/.agents/skills"),
    path.join(fs.cwd, "escape/.agents/skills")
  );
  expect([...(await findSkillFolders(fs.cwd))]).toEqual([
    [path.join(fs.cwd, "pkg"), [path.join(fs.cwd, "pkg/.agents/skills")]]
  ]);
});
