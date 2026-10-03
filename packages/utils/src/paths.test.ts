import { resolve } from "node:path";

import { expect, it } from "vite-plus/test";

import { containsPath } from "./paths.ts";

it("does not confuse sibling prefixes with descendants", () => {
  const root = resolve("/workspace");
  expect(containsPath(root, root + "-other")).toBe(false);
});
