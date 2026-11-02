// Count the collected tests and test files of each workspace package, without running them.
// Usage: node .scripts/count-tests.ts
import { execFileSync } from "node:child_process";
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const manifestSchema = z.object({ name: z.string().min(1) });
const collectionSchema = z.array(z.object({ file: z.string().min(1) }));

type Owner = { name: string; directory: string; tests: number; files: Set<string> };

function manifestOwner(manifest: string): Owner {
  return {
    name: manifestSchema.parse(JSON.parse(readFileSync(join(root, manifest), "utf8"))).name,
    directory: join(root, dirname(manifest)) + sep,
    tests: 0,
    files: new Set()
  };
}

function countTests(): void {
  const packages = globSync(["packages/*/package.json", "packages/extensions/*/package.json"], {
    cwd: root
  })
    .map(manifestOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
  // The root test include also collects workspace tooling tests, such as the pi-update scripts.
  const owners = [...packages, manifestOwner("package.json")];

  function owner(file: string): Owner {
    const path = resolve(root, file);
    const entry = owners.find((candidate) => path.startsWith(candidate.directory));

    if (!entry) throw new Error(`No workspace package owns test file: ${file}`);

    return entry;
  }

  const temporaryRoot = join(root, ".tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(temporaryRoot, "count-tests-"));

  function collect(name: string, options: string[]): z.infer<typeof collectionSchema> {
    const output = join(temporaryDirectory, `${name}.json`);
    execFileSync("vp", ["test", "list", "--passWithNoTests", ...options, `--json=${output}`], {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"]
    });

    return collectionSchema.parse(JSON.parse(readFileSync(output, "utf8")));
  }

  try {
    // Runtime collection expands test.each and tests declared in loops.
    for (const test of collect("tests", ["--staticParse=false"])) {
      owner(test.file).tests += 1;
    }

    // File discovery also includes files whose tests are all skipped.
    for (const test of collect("files", ["--filesOnly"])) {
      owner(test.file).files.add(test.file);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const rows = [
    ["Package", "Tests", "Files"],
    ...owners.map((entry) => [entry.name, String(entry.tests), String(entry.files.size)]),
    [
      "Total",
      String(owners.reduce((sum, entry) => sum + entry.tests, 0)),
      String(owners.reduce((sum, entry) => sum + entry.files.size, 0))
    ]
  ];
  const widths = ["Package", "Tests", "Files"].map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0))
  );

  for (const row of rows) {
    console.log(
      row
        .map((value, column) =>
          column === 0 ? value.padEnd(widths[column] ?? 0) : value.padStart(widths[column] ?? 0)
        )
        .join("  ")
    );
  }

  console.log("\nRuntime collection only; skipped/todo cases excluded. No tests ran.");
}

try {
  countTests();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
