import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { workingMessageSettings } from "./settings.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("saves a deduplicated order under workingMessage and warns about invalid orders", () => {
  const root = mkdtempSync(join(tmpdir(), "working-message-settings-"));
  roots.push(root);
  const store = workingMessageSettings({
    cwd: join(root, "project"),
    agentDir: join(root, "agent"),
    projectTrusted: true
  });

  store.save("global", ["b", "a", "b"]);
  expect(JSON.parse(readFileSync(store.paths.global, "utf8"))).toEqual({
    workingMessage: { order: ["b", "a"] }
  });
  expect(() => store.save("global", ["x".repeat(201)])).toThrow("Cannot save this component order");
  mkdirSync(dirname(store.paths.project), { recursive: true });
  writeFileSync(store.paths.project, JSON.stringify({ workingMessage: { order: [""] } }));
  expect(store.load()).toEqual({
    global: ["b", "a"],
    project: undefined,
    warnings: [expect.stringContaining("Cannot load working-message order from")]
  });
});
