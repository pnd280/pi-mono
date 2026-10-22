import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vite-plus/test";

import { readSettingsRecord, updateSettingsRecord } from "./transaction.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-settings-transaction-"));
  directories.push(directory);

  return { directory, path: join(directory, "settings.json") };
};

it("leaves files untouched on mutator rejection and releases the lock for a later update", () => {
  const { directory, path } = fixture();
  const original = '{"theme":"dark","future":{"kept":1}}\n';
  writeFileSync(path, original);
  expect(() =>
    updateSettingsRecord(path, (record) => {
      record.theme = "light";
      throw new Error("rejected");
    })
  ).toThrow("rejected");
  expect(readFileSync(path, "utf8")).toBe(original);
  expect(readdirSync(directory)).toEqual(["settings.json"]);
  updateSettingsRecord(path, (record) => {
    record.theme = "light";
  });
  expect(readSettingsRecord(path)).toEqual({ theme: "light", future: { kept: 1 } });
  expect(readdirSync(directory)).toEqual(["settings.json"]);
});

it("rejects asynchronous mutations instead of committing before they finish", async () => {
  const { directory, path } = fixture();
  writeFileSync(path, '{"theme":"dark"}\n');
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });

  try {
    expect(() =>
      updateSettingsRecord(path, async (record) => {
        await pending;
        record.theme = "light";
      })
    ).toThrow("synchronous");
    expect(readFileSync(path, "utf8")).toBe('{"theme":"dark"}\n');
    expect(readdirSync(directory)).toEqual(["settings.json"]);
    updateSettingsRecord(path, (record) => {
      record.theme = "safe";
    });
    expect(readSettingsRecord(path)).toEqual({ theme: "safe" });
  } finally {
    finish();
    await pending;
  }
});

it("preserves unrelated JSON keys, including names inherited by ordinary objects", () => {
  const { path } = fixture();
  writeFileSync(path, '{"__proto__":{"kept":true},"constructor":"kept","theme":"dark"}');
  updateSettingsRecord(path, (record) => {
    record.theme = "light";
  });
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(
    JSON.parse('{"__proto__":{"kept":true},"constructor":"kept","theme":"light"}')
  );
});

it.each([
  ["oversized input", JSON.stringify({ unused: "x".repeat(1024 * 1024) })],
  ["malformed input", "{broken"],
  ["invalid UTF-8 input", Buffer.from('{"unused":"\xff"}', "latin1")],
  // The input and the compact output with the change fit; only the formatted output does not.
  ["output above 1 MiB after formatting", JSON.stringify({ unused: "x".repeat(1024 * 1024 - 64) })]
])("refuses %s without replacing the file", (_case, content) => {
  const { directory, path } = fixture();
  writeFileSync(path, content);
  const before = readFileSync(path);
  expect(() =>
    updateSettingsRecord(path, (record) => {
      record.added = { order: ["a"] };
    })
  ).toThrow();
  // Buffer.equals: a deep toEqual over 1 MiB takes seconds and times out under load.
  expect(readFileSync(path).equals(before)).toBe(true);
  expect(readdirSync(directory)).toEqual(["settings.json"]);
});

it("follows an existing settings symlink, excludes writers through other aliases, and refuses to replace a dangling link", () => {
  const { directory, path } = fixture();
  const target = join(directory, "target.json");
  writeFileSync(target, '{"theme":"dark"}');
  symlinkSync(target, path);
  updateSettingsRecord(path, (record) => {
    record.theme = "light";
  });
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  expect(readSettingsRecord(target)).toEqual({ theme: "light" });
  // A writer through the target alias must not commit between this update's read and rename.
  updateSettingsRecord(path, (record) => {
    expect(() =>
      updateSettingsRecord(target, (other) => {
        other.savedByOtherWriter = true;
      })
    ).toThrow();
    record.savedByFirstWriter = true;
  });
  expect(readSettingsRecord(target)).toEqual({ theme: "light", savedByFirstWriter: true });
  rmSync(target);
  expect(() =>
    updateSettingsRecord(path, (record) => {
      record.theme = "dark";
    })
  ).toThrow();
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
});

it.runIf(process.platform !== "win32")(
  "keeps existing mode bits across atomic replacement and creates new records privately",
  () => {
    const { path } = fixture();
    expect(readSettingsRecord(path)).toEqual({});
    updateSettingsRecord(path, (record) => {
      record.first = true;
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    rmSync(path);
    writeFileSync(path, "{}");
    // Existing permissions can include bits masked out by the writer's umask.
    chmodSync(path, 0o666);
    const mode = statSync(path).mode & 0o777;
    updateSettingsRecord(path, (record) => {
      record.second = true;
    });
    expect(statSync(path).mode & 0o777).toBe(mode);
  }
);
