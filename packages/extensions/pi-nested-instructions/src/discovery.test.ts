import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

import type { JsonObject } from "@earendil-works/pi-ai";
import type { SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { discover, refresh } from "./discovery.ts";
import { fffSource, fixture } from "./fixture.ts";
import { ledger, readType } from "./ledger.ts";
import { decodeNotice } from "./notices.ts";
import { instructionFiles, type InstructionFiles } from "./storage.ts";

let fs: Awaited<ReturnType<typeof fixture>>;
let files: InstructionFiles;
beforeEach(async () => {
  fs = await fixture();
  files = { stamp: instructionFiles.stamp, read: vi.fn(instructionFiles.read) };
});
afterEach(async () => {
  await fs.dispose();
});

function notices(entries: SessionBoundaryDraft[]) {
  return entries
    .filter((entry) => entry.type === "custom_message")
    .map((entry) => {
      const { notice } = decodeNotice(entry);
      if (!notice) throw new Error("Expected notice details");

      return { ...notice, content: entry.content };
    });
}

async function run(name = "read", input: JsonObject = { path: "pkg/deep/file.ts" }) {
  const entries = await discover([fs.call(name, input)], fs.cwd, fs.manager, files);
  fs.append(entries);

  return entries;
}

it("loads Pi's first readable regular filename per directory, broad to narrow, without ambient files", async () => {
  await fs.write("AGENTS.md", "cwd not ours");
  await fs.write("../AGENTS.md", "parent not ours");
  await fs.write("pkg/AGENTS.md", "parent rules");
  await fs.write("pkg/deep/CLAUDE.MD", "fallback");
  await fs.write("pkg/deep/AGENTS.MD", "uppercase");
  await fs.write("pkg/deep/AGENTS.override.md", "\uFEFFpreferred");
  expect(
    notices(await run()).map(({ path: file, content }) => [path.relative(fs.cwd, file!), content])
  ).toEqual([
    ["pkg/AGENTS.md", "Loaded nested instructions from pkg/AGENTS.md:\n\nparent rules"],
    [
      "pkg/deep/AGENTS.override.md",
      "Loaded nested instructions from pkg/deep/AGENTS.override.md:\n\npreferred"
    ]
  ]);
  expect(files.read).toHaveBeenCalledTimes(2);
  await run();
  expect(files.read).toHaveBeenCalledTimes(2);
});

it("falls back after directories, broken symlinks, or failed content reads", async () => {
  await mkdir(path.join(fs.cwd, "pkg/AGENTS.override.md"), { recursive: true });
  await symlink("missing", path.join(fs.cwd, "pkg/AGENTS.md"));
  const upper = await fs.write("pkg/AGENTS.MD");
  await fs.write("pkg/CLAUDE.md", "usable");
  files.read = vi.fn(async (file: string) => {
    if (file === upper) throw new Error("unreadable");

    return instructionFiles.read(file);
  });
  expect(notices(await run())[0]?.path).toBe(path.join(fs.cwd, "pkg/CLAUDE.md"));
});

it("follows instruction symlinks but not their destination ancestors", async () => {
  await fs.write("../external/AGENTS.md", "do not load this");
  const linked = await fs.write("../external/rules.txt", "linked rules");
  await mkdir(path.join(fs.cwd, "pkg"));
  await symlink(linked, path.join(fs.cwd, "pkg/AGENTS.md"));
  const entries = notices(await run());
  expect(entries).toHaveLength(1);
  expect(entries[0]?.content).toContain("linked rules");
  expect(entries[0]?.path).toBe(path.join(fs.cwd, "pkg/AGENTS.md"));
});

it.each([
  ["read", { path: "pkg/AGENTS.md", limit: 1, selection: { startLine: 3 } }, false],
  ["bash", { command: "head -n 1 pkg/AGENTS.md" }, false],
  ["grep", { path: "pkg/AGENTS.md", pattern: "no matches" }, false],
  ["ffgrep", { path: "pkg/AGENTS.md", pattern: "no matches" }, true],
  ["multi_grep", { constraints: "pkg/AGENTS.md", patterns: ["no matches"] }, true]
] as const)(
  "records metadata only for content-read attempts through %s",
  async (name, input, fff) => {
    const instruction = await fs.write("pkg/AGENTS.md", "NEVER DUPLICATE");
    const call = fs.call(name, input, fff ? fffSource : undefined);
    const entries = await discover([call], fs.cwd, fs.manager, files);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (entry?.type !== "custom" || entry.customType !== readType)
      throw new Error("Expected metadata");
    expect(entry.data).toMatchObject({
      path: instruction,
      toolCallId: call.toolCallId
    });
    expect(JSON.stringify(entries)).not.toContain("NEVER DUPLICATE");
    fs.append(entries);
    expect(notices(await run())).toEqual([]);
    expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
    expect(files.read).not.toHaveBeenCalled();
  }
);

it("marks failed attempts too, and never treats directory listings as loaded content", async () => {
  const entries = await run("read", { path: "pkg/AGENTS.md" });
  expect(entries[0]?.type).toBe("custom");
  await fs.write("pkg/AGENTS.md", "appeared later");
  expect(await run()).toEqual([]);
  expect(files.read).not.toHaveBeenCalled();
  fs.manager.appendCompaction("summary", null, 1);
  expect(notices(await run("ls", { path: "pkg/" }))).toHaveLength(1);
});

it("gathers markers across the batch before reading content, while preserving preferred overrides", async () => {
  await fs.write("pkg/AGENTS.md", "already being read");
  const ordinary = fs.call("read", { path: "pkg/file.ts" });
  const direct = fs.call("bash", { command: "cat pkg/AGENTS.md" });
  const entries = await discover([ordinary, direct], fs.cwd, fs.manager, files);
  fs.append(entries);
  expect(entries).toHaveLength(1);
  expect(files.read).not.toHaveBeenCalled();
  await fs.write("pkg/AGENTS.override.md", "preferred override");
  expect(notices(await run())[0]?.path).toBe(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  expect(files.read).toHaveBeenCalledTimes(1);
});

it("reloads notices removed or replaced by context edits and by compaction", async () => {
  await fs.write("pkg/AGENTS.md", "rules");
  const entries = await discover(
    [fs.call("read", { path: "pkg/file" })],
    fs.cwd,
    fs.manager,
    files
  );
  const [id] = fs.append(entries);
  fs.manager.appendContextEdit(id!, { content: "shortened" });
  expect(notices(await run())).toHaveLength(1);
  const visible = fs.manager.getLeafId()!;
  fs.manager.appendContextEdit(visible, null);
  expect(notices(await run())).toHaveLength(1);
  fs.manager.appendCompaction("summary", null, 1);
  expect(notices(await run())).toHaveLength(1);
});

it("ties read markers to their exact projected call, not raw history or branch summaries", async () => {
  const file = await fs.write("pkg/AGENTS.md", "rules");
  const call = fs.call("read", { path: "pkg/AGENTS.md" });
  const callEntry = fs.manager.getLeafId()!;
  fs.append(await discover([call], fs.cwd, fs.manager, files));
  expect(ledger(fs.manager).wasRead(file)).toBe(true);
  fs.manager.appendContextEdit(callEntry, { content: "call removed" });
  expect(ledger(fs.manager).wasRead(file)).toBe(false);
  expect(notices(await run())).toHaveLength(1);
  fs.manager.branch(callEntry);
  expect(ledger(fs.manager).wasRead(file)).toBe(false);
  expect(notices(await run())).toHaveLength(1);
});

it("rejects malformed markers and expires markers when a projected call's arguments change", async () => {
  const file = await fs.write("pkg/AGENTS.md", "rules");
  const other = path.join(fs.cwd, "other/AGENTS.md");
  const call = fs.call("read", { path: "pkg/AGENTS.md" });
  const origin = fs.manager.getLeafId()!;
  fs.append(await discover([call], fs.cwd, fs.manager, files));
  fs.manager.appendCustomEntry(readType, { path: other });
  expect(ledger(fs.manager).wasRead(file)).toBe(true);
  expect(ledger(fs.manager).wasRead(other)).toBe(false);
  fs.manager.appendContextEdit(origin, {
    content: [
      { type: "toolCall", id: call.toolCallId, name: "read", arguments: { path: "other/file.ts" } }
    ]
  });
  expect(ledger(fs.manager).wasRead(file)).toBe(false);
  expect(notices(await run())).toHaveLength(1);
});

it("never substitutes content reads for failed metadata inspection", async () => {
  await fs.write("pkg/AGENTS.md", "do not duplicate");

  files.stamp = async () => {
    throw new Error("metadata unavailable");
  };

  const entries = await run("read", { path: "pkg/AGENTS.md" });
  expect(entries).toHaveLength(1);
  expect(entries[0]?.type).toBe("custom");
  expect(files.read).not.toHaveBeenCalled();
});

it("an empty preferred instruction file still suppresses lower-priority content", async () => {
  await fs.write("pkg/AGENTS.override.md", "");
  await fs.write("pkg/AGENTS.md", "not selected");
  const entries = notices(await run());
  expect(entries).toHaveLength(1);
  expect(entries[0]?.path).toBe(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  expect(entries[0]?.content).not.toContain("not selected");
});

it("keeps ordinary snapshots and refreshes only changed/removed visible scopes", async () => {
  await fs.write("pkg/AGENTS.md", "old");
  await run();
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  await fs.write("pkg/AGENTS.override.md", "new preferred");
  expect(await run()).toEqual([]);
  const updated = await refresh(fs.cwd, fs.manager, files);
  expect(notices(updated)).toMatchObject([
    { action: "updated", path: path.join(fs.cwd, "pkg/AGENTS.override.md") }
  ]);
  fs.append(updated);
  await rm(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  fs.append(await refresh(fs.cwd, fs.manager, files));
  await rm(path.join(fs.cwd, "pkg/AGENTS.md"));
  const removed = await refresh(fs.cwd, fs.manager, files);
  expect(notices(removed)).toMatchObject([{ action: "removed", path: null }]);
  fs.append(removed);
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  fs.manager.appendCompaction("summary", null, 1);
  await fs.write("pkg/AGENTS.md", "not eagerly reloaded");
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  expect(notices(await run())).toHaveLength(1);
});

it("rechecks changed direct-read files on reload without retaining their old contents", async () => {
  await fs.write("pkg/AGENTS.md", "old direct");
  await run("bash", { command: "cat pkg/AGENTS.md" });
  await fs.write("pkg/AGENTS.md", "new and longer direct rules");
  const changes = await refresh(fs.cwd, fs.manager, files);
  expect(notices(changes)[0]?.content).toContain("new and longer direct rules");
  fs.append(changes);
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
});
