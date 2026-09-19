import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { RunChanges } from "./changes.ts";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "pi-agent-summary-changes-"));
  directories.push(directory);

  return { directory, changes: new RunChanges(directory) };
}

it("counts empty file creation and unterminated lines without inventing a trailing line", async () => {
  const { directory, changes } = fixture();
  await changes.beforeCall("empty", "empty.txt");
  writeFileSync(join(directory, "empty.txt"), "");
  await changes.afterCall("empty");
  await changes.beforeCall("lines", "lines.txt");
  writeFileSync(join(directory, "lines.txt"), "one\r\ntwo");
  await changes.afterCall("lines");
  expect(changes.finish()).toEqual([
    { path: "empty.txt", status: "available", added: 0, removed: 0 },
    { path: "lines.txt", status: "available", added: 2, removed: 0 }
  ]);
});

it("marks unreadable or unbounded comparisons unavailable instead of reporting zero", async () => {
  const { directory, changes } = fixture();

  for (const [name, content] of [
    ["large.txt", "x".repeat(65537)],
    ["binary.txt", "a\0b"],
    ["many-lines.txt", "line\n".repeat(2001)]
  ] as const) {
    await changes.beforeCall(name, name);
    writeFileSync(join(directory, name), content);
    await changes.afterCall(name);
  }

  expect(changes.finish()).toEqual([
    { path: "binary.txt", status: "unavailable", reason: "Binary content." },
    {
      path: "large.txt",
      status: "unavailable",
      reason: "Could not read complete UTF-8 source within 64 KiB."
    },
    {
      path: "many-lines.txt",
      status: "unavailable",
      reason: "Line statistics exceeded the diff budget."
    }
  ]);
});

it("keeps one identity when a write creates directories below a symlink", async () => {
  const { directory, changes } = fixture();
  mkdirSync(join(directory, "real"));
  symlinkSync(join(directory, "real"), join(directory, "alias"));
  await changes.beforeCall("create", "alias/nested/file.txt");
  mkdirSync(join(directory, "real/nested"));
  writeFileSync(join(directory, "real/nested/file.txt"), "first\n");
  await changes.afterCall("create");
  await changes.beforeCall("edit", "alias/nested/file.txt");
  writeFileSync(join(directory, "real/nested/file.txt"), "last\n");
  await changes.afterCall("edit");
  expect(changes.finish()).toEqual([
    { path: "real/nested/file.txt", status: "available", added: 1, removed: 0 }
  ]);
});

it("shares a baseline for preflighted sibling calls and ignores calls without a result", async () => {
  const { directory, changes } = fixture();
  const path = join(directory, "file.txt");
  writeFileSync(path, "old\n");
  await Promise.all([changes.beforeCall("a", path), changes.beforeCall("b", "./file.txt")]);
  writeFileSync(path, "middle\n");
  await changes.afterCall("a");
  writeFileSync(path, "final\nextra\n");
  await changes.afterCall("b");
  await changes.beforeCall("blocked", "other.txt");
  expect(changes.finish()).toEqual([
    { path: "file.txt", status: "available", added: 2, removed: 1 }
  ]);
});
