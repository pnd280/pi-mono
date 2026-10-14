import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { fixture } from "./test-fixture.ts";

let external: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  external = await fixture();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(external.root, { recursive: true, force: true });
});

it.each(["repository", "configuration"])(
  "isolates fixture writes from inherited Git %s selectors",
  async (selector) => {
    external.git("add", "src/main.ts");
    const configPath = path.join(external.root, ".git/config");
    const indexPath = path.join(external.root, ".git/index");
    const originalConfig = await readFile(configPath);
    const originalIndex = await readFile(indexPath);
    if (selector === "repository") {
      vi.stubEnv("GIT_DIR", path.join(external.root, ".git"));
      vi.stubEnv("GIT_WORK_TREE", external.root);
      vi.stubEnv("GIT_COMMON_DIR", path.join(external.root, ".git"));
      vi.stubEnv("GIT_INDEX_FILE", indexPath);
    } else vi.stubEnv("GIT_CONFIG", configPath);
    const isolated = await fixture();

    try {
      expect(await readFile(configPath)).toEqual(originalConfig);
      expect(isolated.git("rev-parse", "--show-toplevel").trim()).toBe(isolated.root);
      expect(isolated.git("config", "core.excludesFile").trim()).toBe(
        path.join(isolated.root, "global-excludes")
      );
      isolated.git("add", ".gitignore");
      expect(await readFile(indexPath)).toEqual(originalIndex);
      expect(isolated.git("ls-files").trim()).toBe(".gitignore");
    } finally {
      await rm(isolated.root, { recursive: true, force: true });
    }
  }
);
