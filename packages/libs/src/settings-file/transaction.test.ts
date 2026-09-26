import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
