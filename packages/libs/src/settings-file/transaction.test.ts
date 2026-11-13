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

import { readSettingsRecord, replaceSettingsField } from "./transaction.ts";

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

it("leaves the file untouched when the section is not an object and releases the lock for a later update", () => {
  const { directory, path } = fixture();
  const original = '{"theme":"dark","ext.test":["kept"]}\n';
  writeFileSync(path, original);
  expect(() =>
    replaceSettingsField(path, { key: "ext.test", field: "order", value: ["a"] })
  ).toThrow("object");
  expect(readFileSync(path, "utf8")).toBe(original);
  expect(readdirSync(directory)).toEqual(["settings.json"]);
  replaceSettingsField(path, { key: "ext.other", field: "order", value: ["a"] });
  expect(readSettingsRecord(path)).toEqual({
    theme: "dark",
    "ext.test": ["kept"],
    "ext.other": { order: ["a"] }
  });
  expect(readdirSync(directory)).toEqual(["settings.json"]);
});

it("preserves unrelated JSON keys, including names inherited by ordinary objects", () => {
  const { path } = fixture();
  writeFileSync(
    path,
    '{"__proto__":{"kept":true},"constructor":"kept","ext.test":{"constructor":"kept","order":1}}'
  );
  replaceSettingsField(path, { key: "ext.test", field: "order", value: ["b"] });
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(
    JSON.parse(
      '{"__proto__":{"kept":true},"constructor":"kept","ext.test":{"constructor":"kept","order":["b"]}}'
    )
  );
});

it.each([
  ["malformed input", "{broken"],
  ["invalid UTF-8 input", Buffer.from('{"unused":"\xff"}', "latin1")],
  // Oversized input would also fail this output limit (replaceSettingsField), so one row covers both. The input and the compact output with the change fit; only the formatted output does not.
  ["output above 1 MiB after formatting", JSON.stringify({ unused: "x".repeat(1024 * 1024 - 64) })]
])("refuses %s without replacing the file", (_case, content) => {
  const { directory, path } = fixture();
  writeFileSync(path, content);
  const before = readFileSync(path);
  expect(() =>
    replaceSettingsField(path, { key: "added", field: "order", value: ["a"] })
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
  replaceSettingsField(path, { key: "ext.test", field: "order", value: ["a"] });
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  expect(readSettingsRecord(target)).toEqual({ theme: "dark", "ext.test": { order: ["a"] } });
  // A writer through the target alias must not commit between this update's read and rename. Serialisation runs in that window, so toJSON attempts the competing update there.
  const value = {
    toJSON: () => {
      expect(() =>
        replaceSettingsField(target, { key: "ext.other", field: "order", value: ["x"] })
      ).toThrow();

      return ["b"];
    }
  };
  replaceSettingsField(path, { key: "ext.test", field: "order", value });
  expect(readSettingsRecord(target)).toEqual({ theme: "dark", "ext.test": { order: ["b"] } });
  rmSync(target);
  expect(() =>
    replaceSettingsField(path, { key: "ext.test", field: "order", value: ["c"] })
  ).toThrow();
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
});

it.runIf(process.platform !== "win32")(
  "keeps existing mode bits across atomic replacement and creates new records privately",
  () => {
    const { path } = fixture();
    expect(readSettingsRecord(path)).toEqual({});
    replaceSettingsField(path, { key: "ext.test", field: "first", value: true });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    rmSync(path);
    writeFileSync(path, "{}");
    // Existing permissions can include bits masked out by the writer's umask.
    chmodSync(path, 0o666);
    const mode = statSync(path).mode & 0o777;
    replaceSettingsField(path, { key: "ext.test", field: "second", value: true });
    expect(statSync(path).mode & 0o777).toBe(mode);
  }
);
