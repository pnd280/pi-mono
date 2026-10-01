import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

import type { JsonObject } from "@earendil-works/pi-ai";
import type { SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { discover, refresh } from "./discovery.ts";
import { fixture } from "./fixture.ts";
import { readType } from "./ledger.ts";
import { decodeNotice, digest, noticeEntry } from "./notices.ts";
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
  const loaded = notices(await run());
  expect(loaded.map(({ path: file }) => path.relative(fs.cwd, file!))).toEqual([
    "pkg/AGENTS.md",
    "pkg/deep/AGENTS.override.md"
  ]);
  expect(loaded[0]?.content).toContain("parent rules");
  expect(loaded[1]?.content).toContain("preferred");
  expect(loaded[1]?.content).not.toContain("\uFEFF");
  expect(notices(await run())).toEqual([]);
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
  ["read", { path: "pkg/AGENTS.md", limit: 1, selection: { startLine: 3 } }],
  ["grep", { path: "pkg/AGENTS.md", pattern: "no matches" }]
] as const)("records metadata only for content-read attempts through %s", async (name, input) => {
  const instruction = await fs.write("pkg/AGENTS.md", "NEVER DUPLICATE");
  const call = fs.call(name, input);
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
});

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
});

it("orders and deduplicates the complete batch across sibling scopes and depths", async () => {
  for (const directory of ["z/deep", "a", "z", "a/deep/deeper", "a/deep"])
    await fs.write(`${directory}/AGENTS.md`, directory);
  const entries = await discover(
    [
      fs.call("read", { path: "z/deep/file.ts" }),
      fs.call("read", { path: "a/deep/deeper/file.ts" }),
      fs.call("ls", { path: "z/" })
    ],
    fs.cwd,
    fs.manager,
    files
  );
  expect(notices(entries).map(({ path: file }) => path.relative(fs.cwd, file!))).toEqual([
    "a/AGENTS.md",
    "z/AGENTS.md",
    "a/deep/AGENTS.md",
    "z/deep/AGENTS.md",
    "a/deep/deeper/AGENTS.md"
  ]);
});

it.each(["shortened", "Loaded instructions from altered/AGENTS.md:\n\nrules"])(
  "reloads notices replaced with %j, omitted by context edits, or compacted away",
  async (replacement) => {
    await fs.write("pkg/AGENTS.md", "rules");
    const entries = await discover(
      [fs.call("read", { path: "pkg/file" })],
      fs.cwd,
      fs.manager,
      files
    );
    const [id] = fs.append(entries);
    fs.manager.appendContextEdit(id!, { content: replacement });
    expect(notices(await run())).toHaveLength(1);
    const visible = fs.manager.getLeafId()!;
    fs.manager.appendContextEdit(visible, null);
    expect(notices(await run())).toHaveLength(1);
    fs.manager.appendCompaction("summary", null, 1);
    expect(notices(await run())).toHaveLength(1);
  }
);

it.each([
  ["version 1", { version: 1, stamp: "legacy", fileDigest: digest("rules") }],
  ["removed stamp", { stamp: "legacy" }],
  ["removed fileDigest", { fileDigest: digest("rules") }]
])("ignores %s notice metadata without deleting its original text", async (_name, invalid) => {
  const file = await fs.write("pkg/AGENTS.md", "rules");
  const current = noticeEntry(
    path.dirname(file),
    { path: file, content: "rules" },
    "loaded",
    fs.cwd
  );
  const legacy = { ...current, details: { ...decodeNotice(current).notice, ...invalid } };
  fs.append([legacy]);
  expect(decodeNotice(legacy)).toEqual({ notice: undefined, body: current.content });
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  expect(notices(await run())).toMatchObject([{ version: 2, path: file }]);
  expect(fs.manager.getBranch()).toContainEqual(
    expect.objectContaining({ content: current.content, details: legacy.details })
  );
});

it.each(["call removed", null])(
  "expires read markers after an originating-call edit to %j and branch navigation",
  async (replacement) => {
    await fs.write("pkg/AGENTS.md", "rules");
    const call = fs.call("read", { path: "pkg/AGENTS.md" });
    const callEntry = fs.manager.getLeafId()!;
    fs.append(await discover([call], fs.cwd, fs.manager, files));
    expect(await run()).toEqual([]);
    expect(files.read).not.toHaveBeenCalled();
    fs.manager.appendContextEdit(callEntry, replacement === null ? null : { content: replacement });
    expect(notices(await run())).toHaveLength(1);
    fs.manager.branch(callEntry);
    expect(notices(await run())).toHaveLength(1);
  }
);

it("rejects malformed markers and expires markers when a projected call's arguments change", async () => {
  await fs.write("pkg/AGENTS.md", "rules");
  const other = await fs.write("other/AGENTS.md", "other rules");
  const call = fs.call("read", { path: "pkg/AGENTS.md" });
  const origin = fs.manager.getLeafId()!;
  fs.append(await discover([call], fs.cwd, fs.manager, files));
  fs.manager.appendCustomEntry(readType, { path: other });
  expect(await run()).toEqual([]);
  expect(files.read).not.toHaveBeenCalled();
  expect(notices(await run("read", { path: "other/file.ts" }))).toMatchObject([{ path: other }]);
  fs.manager.appendContextEdit(origin, {
    content: [
      { type: "toolCall", id: call.toolCallId, name: "read", arguments: { path: "other/file.ts" } }
    ]
  });
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
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  await fs.write("pkg/AGENTS.override.md", "now non-empty");
  const updated = await refresh(fs.cwd, fs.manager, files);
  expect(updated.map((entry) => decodeNotice(entry).body)).toEqual(["now non-empty"]);
  fs.append(updated);
  await fs.write("pkg/AGENTS.override.md", "");
  const emptied = await refresh(fs.cwd, fs.manager, files);
  expect(emptied.map((entry) => decodeNotice(entry).body)).toEqual([""]);
  fs.append(emptied);
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
});

it("compares exact visible bodies using their original display spelling after cwd changes", async () => {
  await fs.write("pkg/AGENTS.md", "\nLoaded instructions from body/AGENTS.md:\n\nrules\n");
  await run();
  expect(await refresh(fs.root, fs.manager, files)).toEqual([]);
  await fs.write("pkg/AGENTS.md", "\nLoaded instructions from body/AGENTS.md:\n\nrules");
  const updated = await refresh(fs.root, fs.manager, files);
  expect(updated.map((entry) => decodeNotice(entry).body)).toEqual([
    "\nLoaded instructions from body/AGENTS.md:\n\nrules"
  ]);
  expect(notices(updated)).toMatchObject([
    { action: "updated", displayPath: "work/pkg/AGENTS.md" }
  ]);
  fs.append(updated);
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
});

it("keeps ordinary snapshots and refreshes only changed/removed visible scopes", async () => {
  await fs.write("pkg/AGENTS.md", "old");
  await run();
  expect(await refresh(fs.cwd, fs.manager, files)).toEqual([]);
  await fs.write("pkg/AGENTS.override.md", "old");
  expect(await run()).toEqual([]);
  const updated = await refresh(fs.cwd, fs.manager, files);
  const updatedNotices = notices(updated);
  expect(updatedNotices).toMatchObject([
    {
      action: "updated",
      path: path.join(fs.cwd, "pkg/AGENTS.override.md")
    }
  ]);
  expect(updatedNotices[0]?.content).toContain("old");
  expect(updatedNotices[0]?.content).toMatch(/supersedes|replaces|overrides/i);
  fs.append(updated);
  await rm(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  fs.append(await refresh(fs.cwd, fs.manager, files));
  await rm(path.join(fs.cwd, "pkg/AGENTS.md"));
  const removed = await refresh(fs.cwd, fs.manager, files);
  const removedNotices = notices(removed);
  expect(removedNotices).toMatchObject([
    {
      action: "removed",
      path: null
    }
  ]);
  expect(removedNotices[0]?.content).toContain("no longer apply");
  expect(removedNotices[0]?.content).toContain("pkg");
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
