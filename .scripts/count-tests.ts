// Count the collected tests of each workspace package, without running them.
// Usage: node .scripts/count-tests.ts
import { execFileSync } from "node:child_process";
import { globSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const manifestSchema = z.object({ name: z.string() });
const collectionSchema = z.array(z.object({ file: z.string() }));

type Owner = { name: string; directory: string; tests: number };

function manifestOwner(manifest: string): Owner {
  return {
    name: manifestSchema.parse(JSON.parse(readFileSync(join(root, manifest), "utf8"))).name,
    directory: join(root, dirname(manifest)) + sep,
    tests: 0
  };
}

const packages = globSync(["packages/*/package.json", "packages/extensions/*/package.json"], {
  cwd: root
})
  .map(manifestOwner)
  .sort((a, b) => a.name.localeCompare(b.name));
// The root owns the rest of the root test include, such as the pi-update scripts.
const workspace = manifestOwner("package.json");
const owners = [...packages, workspace];
const output = join(root, ".tmp/count-tests.json");

mkdirSync(dirname(output), { recursive: true });

// Runtime collection expands test.each and tests declared in loops.
execFileSync("vp", ["test", "list", "--staticParse=false", `--json=${output}`], {
  cwd: root,
  stdio: ["ignore", "inherit", "inherit"]
});

try {
  for (const { file } of collectionSchema.parse(JSON.parse(readFileSync(output, "utf8")))) {
    const path = resolve(root, file);
    (owners.find((owner) => path.startsWith(owner.directory)) ?? workspace).tests += 1;
  }
} finally {
  rmSync(output, { force: true });
}

const rows = [
  ...owners.map((owner) => [owner.name, String(owner.tests)]),
  ["Total", String(owners.reduce((sum, owner) => sum + owner.tests, 0))]
];
const width = Math.max(...rows.map(([name = ""]) => name.length));

for (const [name = "", tests = ""] of rows) console.log(`${name.padEnd(width)}  ${tests}`);

console.log("\nRuntime collection only; skipped/todo cases excluded. No tests ran.");
