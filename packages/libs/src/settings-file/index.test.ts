import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { readSettingsFile } from "./index.ts";

const directories: string[] = [];

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "settings-file-"));
  directories.push(directory);

  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it("reads complete regular files and follows symlinks", () => {
  const directory = fixture();
  const source = join(directory, "settings.json");
  writeFileSync(source, '{"ext.test":true}');
  symlinkSync(source, join(directory, "link.json"));

  expect(readSettingsFile(source)).toBe('{"ext.test":true}');
  expect(readSettingsFile(join(directory, "link.json"))).toBe('{"ext.test":true}');
});

it("refuses non-files and files exceeding 1 MiB without clipping", () => {
  const directory = fixture();
  const source = join(directory, "settings.json");
  expect(readSettingsFile(directory)).toBeUndefined();
  writeFileSync(source, "x".repeat(1024 * 1024));
  expect(readSettingsFile(source)).toHaveLength(1024 * 1024);
  writeFileSync(source, "x".repeat(1024 * 1024 + 1));
  expect(readSettingsFile(source)).toBeUndefined();
});

it("leaves missing-file errors to the caller", () => {
  expect(() => readSettingsFile(join(fixture(), "missing.json"))).toThrow();
});
