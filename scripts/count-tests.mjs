#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { globSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const manifestSchema = z.object({ name: z.string().min(1) });
const collectionSchema = z.array(z.object({ file: z.string().min(1) }));

function countTests() {
  const packages = globSync(["packages/*/package.json", "packages/extensions/*/package.json"], {
    cwd: root
  })
    .map((manifest) => ({
      name: manifestSchema.parse(JSON.parse(readFileSync(join(root, manifest), "utf8"))).name,
      directory: join(root, dirname(manifest)) + sep,
      tests: 0,
      files: new Set()
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /** @param {string} file */
  function owner(file) {
    const entry = packages.find((pkg) => resolve(root, file).startsWith(pkg.directory));

    if (!entry) {
      throw new Error(`No workspace package owns test file: ${file}`);
    }

    return entry;
  }

  const temporaryRoot = join(root, ".tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(temporaryRoot, "count-tests-"));

  /**
   * @param {string} name
   * @param {string[]} options
   */
  function collect(name, options) {
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
    ...packages.map((pkg) => [pkg.name, String(pkg.tests), String(pkg.files.size)]),
    [
      "Total",
      String(packages.reduce((sum, pkg) => sum + pkg.tests, 0)),
      String(packages.reduce((sum, pkg) => sum + pkg.files.size, 0))
    ]
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

  for (const row of rows) {
    console.log(
      row
        .map((value, column) =>
          column === 0 ? value.padEnd(widths[column]) : value.padStart(widths[column])
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
