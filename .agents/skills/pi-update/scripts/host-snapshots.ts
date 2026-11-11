// Fail when pnpm-lock.yaml has more than one snapshot of a Pi host package. A second snapshot, such as a stale peer variant left by `vp update`, gives workspace packages two instances of that package, so `instanceof` and module state no longer match Pi's.
// Usage: node .agents/skills/pi-update/scripts/host-snapshots.ts
//
// The workspace has no YAML parser, so this reads the `snapshots:` map of every YAML document line by line, with the plain or single-quoted keys that pnpm writes.
import { readFileSync } from "node:fs";

const hosts = ["pi-agent-core", "pi-ai", "pi-coding-agent", "pi-tui"].map((name) => `@earendil-works/${name}`);
const lockfile = "pnpm-lock.yaml";
const snapshots = new Map<string, string[]>(hosts.map((name) => [name, []]));
let inSnapshots = false;
let entries = 0;

for (const line of readFileSync(lockfile, "utf8").split("\n")) {
  if (/^\S/.test(line)) {
    inSnapshots = line === "snapshots:";
    continue;
  }

  const key = inSnapshots ? /^ {2}'?((?:@[^/@]+\/)?[^@'\s]+)@([^']*)'?:/.exec(line) : null;

  if (!key) continue;

  entries++;
  snapshots.get(key[1] ?? "")?.push(key[2] ?? "");
}

let duplicated = 0;

for (const [name, variants] of snapshots) {
  if (variants.length <= 1) continue;

  duplicated++;
  console.log(`DUPLICATE ${name}: ${variants.length} snapshots`);
  for (const variant of variants) console.log(`  ${variant}`);
}

console.log(`${lockfile}: ${entries} snapshot(s), ${duplicated} Pi host package(s) with more than one snapshot.`);

if (duplicated) {
  console.log(
    [
      "Each snapshot installs its own copy, so workspace packages and Pi load two instances of the package.",
      "`vp dedupe`, `vp install --fix-lockfile`, and `vp update -r` do not remove a snapshot for a stale peer variant. Remove it by hand:",
      "1. Find the stale peer with `vp why <peer>`.",
      "2. In pnpm-lock.yaml, delete the `snapshots:` entries whose key contains the stale peer version, replace each remaining `(<peer>@<stale version>)` reference with the current version, and delete the stale package entry when nothing references it.",
      "3. Run `vp install --frozen-lockfile` and this check again. Confirm that node_modules/.pnpm/ has one directory for the package.",
    ].join("\n")
  );
}

process.exitCode = duplicated ? 1 : 0;
