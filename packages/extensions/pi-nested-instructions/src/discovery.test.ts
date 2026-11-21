import { mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";

import type { JsonObject } from "@earendil-works/pi-ai";
import type { ContextEditableContent, SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { discover, refresh } from "./discovery.ts";
import { readType } from "./ledger.ts";
import { decodeNotice, noticeEntry } from "./notices.ts";
import { findSkillFolders, type SkillFolders } from "./skill-folders.ts";
import { listingSchema, listingType } from "./skill-listings.ts";
import { instructionFiles, type InstructionFiles } from "./storage.ts";
import { fixture } from "./test-fixture.ts";

let fs: Awaited<ReturnType<typeof fixture>>;
let files: InstructionFiles;
let skillFolders: SkillFolders;
beforeEach(async () => {
  fs = await fixture();
  skillFolders = new Map();
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

function listings(entries: SessionBoundaryDraft[]) {
  return entries.flatMap((entry) =>
    entry.type === "custom_message" && entry.customType === listingType
      ? [{ ...listingSchema.parse(entry.details), content: entry.content }]
      : []
  );
}

const skillFile = (description: string) => `---\nname: deploy\ndescription: ${description}\n---\n`;

async function run(name = "read", input: JsonObject = { path: "pkg/deep/file.ts" }) {
  const entries = await discover([fs.call(name, input)], fs.cwd, fs.manager, skillFolders, files);
  fs.append(entries);

  return entries;
}

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
  const entries = await discover([call], fs.cwd, fs.manager, skillFolders, files);
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
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
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

it.each([
  ["shortened", (): ContextEditableContent => "shortened", 1],
  [
    "another notice",
    (): ContextEditableContent =>
      noticeEntry(
        "/altered",
        { action: "loaded", path: "/altered/AGENTS.md", content: "rules" },
        "/"
      ).content,
    1
  ],
  ["an equal text block", (text: string): ContextEditableContent => [{ type: "text", text }], 0]
] as const)(
  "after a replacement with %s, reloads notices omitted by context edits, compaction, or branch navigation",
  async (_name, replace, reloaded) => {
    await fs.write("pkg/AGENTS.md", "rules");
    const call = fs.call("read", { path: "pkg/file" });
    const entries = await discover([call], fs.cwd, fs.manager, skillFolders, files);
    const [id] = fs.append(entries);
    const [entry] = entries;
    if (entry?.type !== "custom_message" || typeof entry.content !== "string")
      throw new Error("Expected a notice");
    fs.manager.appendContextEdit(id!, { content: replace(entry.content) });
    expect(notices(await run())).toHaveLength(reloaded);
    const visible = reloaded ? fs.manager.getLeafId()! : id!;
    fs.manager.appendContextEdit(visible, null);
    expect(notices(await run())).toHaveLength(1);
    fs.manager.appendCompaction("summary", null, 1);
    expect(notices(await run())).toHaveLength(1);
    fs.manager.branch(call.callEntryId!);
    expect(notices(await run())).toHaveLength(1);
  }
);

it.each([
  ["version 2", { version: 2 }],
  ["unknown key", { stamp: "unknown" }]
])("ignores %s notice metadata without deleting its original text", async (_name, invalid) => {
  const file = await fs.write("pkg/AGENTS.md", "rules");
  const current = noticeEntry(
    path.dirname(file),
    { action: "loaded", path: file, content: "rules" },
    fs.cwd
  );
  const rejected = { ...current, details: { ...decodeNotice(current).notice, ...invalid } };
  fs.append([rejected]);
  expect(decodeNotice(rejected)).toEqual({ notice: undefined, body: current.content });
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
  expect(notices(await run())).toMatchObject([{ version: 3, path: file }]);
  expect(fs.manager.getBranch()).toContainEqual(
    expect.objectContaining({ content: current.content, details: rejected.details })
  );
});

it.each(["call removed", null])(
  "expires read markers after an originating-call edit to %j and branch navigation",
  async (replacement) => {
    await fs.write("pkg/AGENTS.md", "rules");
    const call = fs.call("read", { path: "pkg/AGENTS.md" });
    const callEntry = fs.manager.getLeafId()!;
    fs.append(await discover([call], fs.cwd, fs.manager, skillFolders, files));
    expect(await run()).toEqual([]);
    expect(files.read).not.toHaveBeenCalled();
    fs.manager.appendContextEdit(callEntry, replacement === null ? null : { content: replacement });
    expect(notices(await run())).toHaveLength(1);
    fs.manager.branch(callEntry);
    expect(notices(await run())).toHaveLength(1);
  }
);

it("rejects malformed markers and requires the exact unchanged projected call", async () => {
  await fs.write("pkg/AGENTS.md", "rules");
  const other = await fs.write("other/AGENTS.md", "other rules");
  const call = fs.call("read", { path: "pkg/AGENTS.md" });
  const origin = fs.manager.getLeafId()!;
  fs.append(await discover([call], fs.cwd, fs.manager, skillFolders, files));
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

  fs.manager.appendCompaction("summary", null, 1);
  const edited = fs.call("read", { path: "pkg/AGENTS.md" });
  fs.manager.appendContextEdit(fs.manager.getLeafId()!, {
    content: [
      {
        type: "toolCall",
        id: edited.toolCallId,
        name: "read",
        arguments: { path: "other/file.ts" }
      }
    ]
  });
  const discovered = await discover([edited], fs.cwd, fs.manager, skillFolders, files);
  expect(notices(discovered)).toMatchObject([{ path: path.join(fs.cwd, "pkg/AGENTS.md") }]);
  expect(discovered.filter((entry) => entry.type === "custom")).toHaveLength(0);

  fs.manager.appendCompaction("summary", null, 1);
  fs.call("read", { path: "pkg/AGENTS.md" });
  const previous = fs.manager.getLeafId()!;
  const omitted = fs.call("read", { path: "pkg/AGENTS.md" });
  const omittedEntry = fs.manager.getLeafId()!;
  fs.manager.appendContextEdit(previous, {
    content: [
      {
        type: "toolCall",
        id: omitted.toolCallId,
        name: "read",
        arguments: { path: "pkg/AGENTS.md" }
      }
    ]
  });
  fs.manager.appendContextEdit(omittedEntry, null);
  const rediscovered = await discover([omitted], fs.cwd, fs.manager, skillFolders, files);
  expect(notices(rediscovered)).toMatchObject([{ path: path.join(fs.cwd, "pkg/AGENTS.md") }]);
});

it("an empty preferred instruction file still suppresses lower-priority content", async () => {
  await fs.write("pkg/AGENTS.override.md", "");
  await fs.write("pkg/AGENTS.md", "not selected");
  const entries = notices(await run());
  expect(entries).toHaveLength(1);
  expect(entries[0]?.path).toBe(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  expect(entries[0]?.content).not.toContain("not selected");
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
  await fs.write("pkg/AGENTS.override.md", "now non-empty");
  const updated = await refresh(fs.cwd, fs.manager, skillFolders, files);
  expect(updated.map((entry) => decodeNotice(entry).body)).toEqual(["now non-empty"]);
  fs.append(updated);
  await fs.write("pkg/AGENTS.override.md", "");
  const emptied = await refresh(fs.cwd, fs.manager, skillFolders, files);
  expect(emptied.map((entry) => decodeNotice(entry).body)).toEqual([""]);
  fs.append(emptied);
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
  await fs.write("pkg/AGENTS.md", "");
  await rm(path.join(fs.cwd, "pkg/AGENTS.override.md"));
  expect(notices(await refresh(fs.cwd, fs.manager, skillFolders, files))).toMatchObject([
    { action: "updated", path: path.join(fs.cwd, "pkg/AGENTS.md") }
  ]);
});

it("lists a directory's skills again after a context edit, compaction, or branch navigation changes or removes the listing", async () => {
  await fs.write("pkg/.agents/skills/deploy/SKILL.md", skillFile("deploys"));
  skillFolders = await findSkillFolders(fs.cwd);
  const call = fs.call("read", { path: "pkg/file" });
  const entries = await discover([call], fs.cwd, fs.manager, skillFolders, files);
  expect(listings(entries)).toHaveLength(1);
  const [id] = fs.append(entries);
  expect(listings(await run())).toHaveLength(0);
  fs.manager.appendContextEdit(id!, { content: "shortened" });
  expect(listings(await run())).toHaveLength(1);
  fs.manager.appendContextEdit(fs.manager.getLeafId()!, null);
  expect(listings(await run())).toHaveLength(1);
  fs.manager.appendCompaction("summary", null, 1);
  expect(listings(await run())).toHaveLength(1);
  fs.manager.branch(call.callEntryId!);
  expect(listings(await run())).toHaveLength(1);
});

it("refresh replaces a visible listing when the skills on disk differ and removes it when none remain", async () => {
  const file = await fs.write("pkg/.agents/skills/deploy/SKILL.md", skillFile("deploys"));
  skillFolders = await findSkillFolders(fs.cwd);
  expect(listings(await run())).toMatchObject([
    { action: "loaded", skills: [{ name: "deploy", description: "deploys" }] }
  ]);
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
  await fs.write("pkg/.agents/skills/deploy/SKILL.md", skillFile("ships"));
  const updated = await refresh(fs.cwd, fs.manager, skillFolders, files);
  expect(listings(updated)).toMatchObject([
    {
      action: "updated",
      directory: path.join(fs.cwd, "pkg"),
      skills: [{ name: "deploy", description: "ships" }]
    }
  ]);
  expect(listings(updated)[0]?.content).toContain("<description>ships</description>");
  fs.append(updated);
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
  await rm(file);
  const removed = await refresh(fs.cwd, fs.manager, skillFolders, files);
  expect(listings(removed)).toMatchObject([{ action: "removed", skills: [] }]);
  fs.append(removed);
  expect(await refresh(fs.cwd, fs.manager, skillFolders, files)).toEqual([]);
});
