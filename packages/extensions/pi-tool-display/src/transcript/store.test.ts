import { randomUUID } from "node:crypto";
import {
  appendFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { LOCAL_READ_BYTES, localKey, LocalStore } from "./store.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "display-local-store-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const header = {
  sessionId: "session",
  sessionFile: "/sessions/a.jsonl",
  cwd: "/work",
  pi: "1.0.2"
};
const call = { entry: "a1b2c3d4", toolCallId: "toolu_1", tool: "bash", durationMs: 12 };
const calls = () => join(root, "pi-tool-display", "calls");

function store(options: { persisted?: boolean; warn?: (message: string) => void } = {}) {
  return new LocalStore({
    root,
    persisted: options.persisted ?? true,
    header,
    warn: options.warn ?? (() => {})
  });
}

it("creates owner-only files and keeps lines written before setup completes", async () => {
  const writer = store();
  writer.open();
  writer.call(call);
  writer.diagnostic({ code: "session-write-failed", detail: "pi-tool-display.call" });
  await writer.dispose();

  const path = join(calls(), `${writer.writer}.jsonl`);
  const lines = (await readFile(path, "utf8"))
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
  expect(lines).toEqual([
    { type: "writer", ...header, started: expect.any(String) as unknown },
    { type: "call", ...call },
    { type: "diagnostic", code: "session-write-failed", detail: "pi-tool-display.call" }
  ]);

  if (process.platform !== "win32") {
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(calls())).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, "pi-tool-display"))).mode & 0o777).toBe(0o700);
  }

  // A later reader sees the same calls; the writer answers from memory.
  const reader = store();
  expect(await reader.read(writer.writer)).toEqual({
    status: "found",
    calls: new Map([[localKey(call.entry, call.toolCallId), call]])
  });
  await reader.dispose();
});

it("keeps sessions that Pi does not save in memory only", async () => {
  const writer = store({ persisted: false });
  writer.open();
  writer.call(call);
  expect(await writer.read(writer.writer)).toMatchObject({ status: "found" });
  await writer.dispose();
  await expect(stat(join(root, "pi-tool-display"))).rejects.toMatchObject({ code: "ENOENT" });
});

// Windows file symlinks need Developer Mode or elevation.
it.skipIf(process.platform === "win32")(
  "refuses a planted symlink for writing and warns once",
  async () => {
    const warn = vi.fn();
    const writer = store({ warn });
    const target = join(root, "target");
    await writeFile(target, "");
    await mkdir(calls(), { recursive: true, mode: 0o700 });
    await symlink(target, join(calls(), `${writer.writer}.jsonl`));
    writer.call(call);
    await writer.dispose();
    writer.call(call);
    expect(await readFile(target, "utf8")).toBe("");
    expect(warn).toHaveBeenCalledOnce();
  }
);

// Windows file symlinks need Developer Mode or elevation.
it.skipIf(process.platform === "win32")(
  "refuses symlinked and hard-linked files for reading",
  async () => {
    const reader = store();
    await mkdir(calls(), { recursive: true, mode: 0o700 });
    const target = join(root, "target");
    await writeFile(target, JSON.stringify({ type: "call", ...call }) + "\n", { mode: 0o600 });
    const linked = randomUUID();
    const hard = randomUUID();
    await symlink(target, join(calls(), `${linked}.jsonl`));
    await link(target, join(calls(), `${hard}.jsonl`));
    expect(await reader.read(linked)).toEqual({ status: "unreadable" });
    expect(await reader.read(hard)).toEqual({ status: "unreadable" });
    await reader.dispose();
  }
);

it("reports absent and oversized files, skips invalid lines, and ignores an unterminated line", async () => {
  const warn = vi.fn();
  const reader = store({ warn });
  await mkdir(calls(), { recursive: true, mode: 0o700 });
  const valid = randomUUID();
  const large = randomUUID();
  await writeFile(
    join(calls(), `${valid}.jsonl`),
    [
      JSON.stringify({ type: "writer", ...header }),
      "not json",
      JSON.stringify({ type: "call", entry: "e", toolCallId: "t" }),
      JSON.stringify({ type: "call", ...call }),
      JSON.stringify({
        type: "call",
        ...call,
        toolCallId: "oversized",
        extra: "é".repeat(16 * 1024)
      }),
      JSON.stringify({ type: "call", ...call, toolCallId: "partial" }).slice(0, -1)
    ].join("\n"),
    { mode: 0o600 }
  );
  await writeFile(join(calls(), `${large}.jsonl`), "", { mode: 0o600 });
  await appendFile(join(calls(), `${large}.jsonl`), Buffer.alloc(LOCAL_READ_BYTES + 1, 0x20));

  expect(await reader.read(randomUUID())).toEqual({ status: "absent" });
  expect(await reader.read(large)).toEqual({ status: "too-large" });
  expect(await reader.read(valid)).toEqual({
    status: "found",
    calls: new Map([[localKey(call.entry, call.toolCallId), call]])
  });
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    `skipped 3 invalid local detail lines of writer ${valid}.`
  );
  await reader.dispose();
});
