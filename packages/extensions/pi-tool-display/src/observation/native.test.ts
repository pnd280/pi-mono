import { mkdirSync, renameSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  defineTool,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { observeMutationDefinition } from "@pi-mono/libs/file-mutations";
import { createToolContext } from "@pi-mono/libs/validation/tool-context";
import { expect, it } from "vite-plus/test";

import type { DisplayFact } from "../contracts.ts";
import { OBSERVATION_BYTES, parseRetainedPatch } from "../diff.ts";
import { record } from "../values.ts";
import { displayMutationSink, observeNativeDefinition, type ObservationSink } from "./native.ts";

function patchOf(fact: DisplayFact | undefined): string | undefined {
  return fact?.kind === "change" && fact.change !== "unavailable" ? fact.patch : undefined;
}

function observeMutation(
  original: ToolDefinition,
  cwd: string,
  begin: (id: string) => ObservationSink
): ToolDefinition {
  return observeMutationDefinition(original, cwd, (id) => [
    displayMutationSink(begin(id), original.name)
  ]);
}

it("preserves shell settings, environment, bytes, errors and structured operation outcomes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-native-shell-"));

  try {
    const original = createBashToolDefinition(directory, {
      shellPath: "/bin/bash",
      commandPrefix: "export DISPLAY_TEST=preserved"
    });
    const facts: DisplayFact[] = [];
    const previews: string[] = [];
    const observed = observeNativeDefinition(
      defineTool(original),
      { cwd: directory, shellPath: "/bin/bash", commandPrefix: "export DISPLAY_TEST=preserved" },
      () => ({
        started() {},
        fact: (value) => facts.push(value),
        preview: (value) => previews.push(value.text)
      })
    );
    const context = await createToolContext(directory);
    const params = { command: 'printf "α\\r\\n%s\\n%s" "$DISPLAY_TEST" "$PI_SESSION_ID"' };
    const expected = await original.execute("plain", params, undefined, undefined, context);
    const updates: unknown[] = [];
    const result = await observed.execute(
      "observed",
      params,
      undefined,
      (value) => updates.push(value),
      context
    );
    // Each execution measures its own wall time, rounded to 0.1 s.
    const untimed = (value: { structuredContent?: unknown }) => ({
      ...value,
      structuredContent: { ...record(value.structuredContent), wall_time_seconds: 0 }
    });
    expect(record(result.structuredContent).wall_time_seconds).toBeTypeOf("number");
    expect(untimed(result)).toEqual(untimed(expected));
    expect(updates.length).toBeGreaterThan(0);
    expect(previews.at(-1)).toContain("α\r\npreserved");
    expect(facts).toContainEqual(
      expect.objectContaining({ kind: "operation", outcome: "success", exitCode: 0 })
    );
    await expect(
      observed.execute("error", { command: "exit 7" }, undefined, undefined, context)
    ).resolves.toMatchObject({ isError: true, structuredContent: { exit_code: 7 } });
    expect(facts.at(-1)).toMatchObject({ outcome: "failure", exitCode: 7 });
    await expect(
      observed.execute(
        "timeout",
        { command: "sleep 3", timeout: 0.01 },
        undefined,
        undefined,
        context
      )
    ).rejects.toThrow("timed out");
    expect(facts.at(-1)).toMatchObject({ timedOut: true, outcome: "failure" });
    const previewsBeforeCancellation = previews.length;
    await expect(
      observed.execute("cancel", { command: "sleep 3" }, AbortSignal.abort(), undefined, context)
    ).rejects.toThrow("aborted");
    expect(facts.at(-1)).toMatchObject({ outcome: "cancelled" });
    expect(previews.length).toBeGreaterThan(previewsBeforeCancellation);
    expect(observed.parameters).toBe(original.parameters);
    expect(observed.promptGuidelines).toBe(original.promptGuidelines);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.each(["edit", "write"] as const)(
  "preserves BOM-bearing files during observed %s",
  async (name) => {
    const directory = await mkdtemp(join(tmpdir(), "display-native-bom-"));

    try {
      const before = "\uFEFFbefore\n";
      const after = "\uFEFFafter\n";
      await writeFile(join(directory, "file"), before);
      const facts: DisplayFact[] = [];
      const original =
        name === "edit"
          ? defineTool(createEditToolDefinition(directory))
          : defineTool(createWriteToolDefinition(directory));
      const observed = observeMutation(original, directory, () => ({
        started() {},
        preview() {},
        fact: (fact) => facts.push(fact)
      }));
      const result = await observed.execute(
        "bom",
        name === "edit"
          ? { path: "file", edits: [{ oldText: "before", newText: "after" }] }
          : { path: "file", content: after },
        undefined,
        undefined,
        await createToolContext(directory)
      );
      expect(await readFile(join(directory, "file"), "utf8")).toBe(after);
      const change = facts.find((fact) => fact.kind === "change");
      expect(patchOf(change)).toBeTypeOf("string");

      if (name === "edit") {
        expect(record(result.details).patch).toBeTypeOf("string");
        expect(patchOf(change)).toBe(record(result.details).patch);
      }

      const bom = name === "write" ? "\uFEFF" : "";
      expect(parseRetainedPatch(patchOf(change)!)?.hunks[0]?.lines).toEqual([
        { kind: "removed", text: `${bom}before`, oldLine: 1 },
        { kind: "added", text: `${bom}after`, newLine: 1 }
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
it("reuses the native edit patch even when the file exceeds the observation limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-native-large-edit-"));

  try {
    const before = Array.from(
      { length: Math.ceil(OBSERVATION_BYTES / 80) },
      (_, index) => `line ${index} ${"x".repeat(80)}\n`
    ).join("");
    expect(Buffer.byteLength(before)).toBeGreaterThan(OBSERVATION_BYTES);
    const oldText = `line 450 ${"x".repeat(80)}`;
    const newText = `changed 450 ${"x".repeat(80)}`;
    const after = before.replace(oldText, newText);
    await writeFile(join(directory, "file"), before);
    const facts: DisplayFact[] = [];
    const observed = observeMutation(
      defineTool(createEditToolDefinition(directory)),
      directory,
      () => ({ started() {}, preview() {}, fact: (fact) => facts.push(fact) })
    );
    const result = await observed.execute(
      "large-edit",
      { path: "file", edits: [{ oldText, newText }] },
      undefined,
      undefined,
      await createToolContext(directory)
    );
    expect(await readFile(join(directory, "file"), "utf8")).toBe(after);
    const change = facts.find((fact) => fact.kind === "change");
    expect(record(result.details).patch).toBeTypeOf("string");
    expect(change).toMatchObject({ change: "modification", patch: record(result.details).patch });
    expect(parseRetainedPatch(patchOf(change)!)).toMatchObject({ added: 1, removed: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("retains a failed edit proposal and preserves the native filesystem error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-native-failed-edit-"));

  try {
    const path = join(directory, "file");
    await writeFile(path, "before\n");
    const facts: DisplayFact[] = [];
    const observed = observeMutation(
      defineTool(createEditToolDefinition(directory)),
      directory,
      () => ({
        started() {
          renameSync(path, path + ".original");
          mkdirSync(path);
        },
        preview() {},
        fact: (fact) => facts.push(fact)
      })
    );
    await expect(
      observed.execute(
        "failed-edit",
        { path, edits: [{ oldText: "before", newText: "after" }] },
        undefined,
        undefined,
        await createToolContext(directory)
      )
    ).rejects.toMatchObject({ code: "EISDIR" });
    expect(facts).toContainEqual(
      expect.objectContaining({ kind: "operation", outcome: "failure" })
    );
    const change = facts.find((fact) => fact.kind === "change");
    expect(patchOf(change)).toContain("+after");
    expect(await readFile(path + ".original", "utf8")).toBe("before\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "retains proposed failed writes and distinguishes unreadability from absence",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "display-native-permissions-"));

    try {
      const path = join(directory, "protected");
      const facts: DisplayFact[] = [];
      const write = observeMutation(
        defineTool(createWriteToolDefinition(directory)),
        directory,
        () => ({ started() {}, preview() {}, fact: (fact) => facts.push(fact) })
      );
      const context = await createToolContext(directory);
      await writeFile(path, "before\n", { mode: 0o400 });
      await expect(
        write.execute("failed-write", { path, content: "after\n" }, undefined, undefined, context)
      ).rejects.toThrow();
      expect(facts).toEqual([
        expect.objectContaining({ kind: "change", change: "modification" }),
        expect.objectContaining({ kind: "operation", outcome: "failure" })
      ]);
      expect(patchOf(facts.find((fact) => fact.kind === "change"))).toContain("-before");
      expect(await readFile(path, "utf8")).toBe("before\n");
      facts.length = 0;
      await chmod(path, 0o200);
      await write.execute(
        "unreadable",
        { path, content: "written\n" },
        undefined,
        undefined,
        context
      );
      expect(facts[0]).toMatchObject({ kind: "change", change: "unavailable" });
      expect(facts.at(-1)).toMatchObject({ kind: "operation", outcome: "success" });
      await chmod(path, 0o600);
      expect(await readFile(path, "utf8")).toBe("written\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it("preserves edit aliases, CRLF, cancellation, and write change facts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "display-native-change-"));

  try {
    const facts = new Map<string, DisplayFact[]>();
    const begin = (id: string) => ({
      started() {},
      preview() {},
      fact(value: DisplayFact) {
        const values = facts.get(id) ?? [];
        values.push(value);
        facts.set(id, values);
      }
    });
    const edit = observeMutation(defineTool(createEditToolDefinition(directory)), directory, begin);
    const write = observeMutation(
      defineTool(createWriteToolDefinition(directory)),
      directory,
      begin
    );
    const context = await createToolContext(directory);
    await writeFile(join(directory, "file"), "alpha\r\nbeta\r\n");
    await symlink("file", join(directory, "alias"));
    const outputs = await Promise.all([
      edit.execute(
        "first",
        { path: "file", edits: [{ oldText: "alpha", newText: "ALPHA" }] },
        undefined,
        undefined,
        context
      ),
      edit.execute(
        "second",
        { path: "alias", edits: [{ oldText: "beta", newText: "BETA" }] },
        undefined,
        undefined,
        context
      )
    ]);
    expect(await readFile(join(directory, "file"), "utf8")).toBe("ALPHA\r\nBETA\r\n");
    for (const output of outputs) expect(record(output.details).patch).toBeTypeOf("string");
    const firstChange = facts.get("first")?.find((fact) => fact.kind === "change");
    expect(patchOf(firstChange)).toContain("+ALPHA");
    await expect(
      edit.execute(
        "cancelled-edit",
        { path: "file", edits: [{ oldText: "ALPHA", newText: "never" }] },
        AbortSignal.abort(),
        undefined,
        context
      )
    ).rejects.toThrow("aborted");
    expect(facts.has("cancelled-edit")).toBe(false);
    expect(await readFile(join(directory, "file"), "utf8")).toBe("ALPHA\r\nBETA\r\n");
    await write.execute(
      "oversized",
      { path: "file", content: "x".repeat(OBSERVATION_BYTES + 1) },
      undefined,
      undefined,
      context
    );
    expect(facts.get("oversized")?.[0]).toMatchObject({ change: "unavailable" });
    expect((await readFile(join(directory, "file"))).length).toBe(OBSERVATION_BYTES + 1);
    await write.execute(
      "created",
      { path: "new", content: "new\n" },
      undefined,
      undefined,
      context
    );
    expect(facts.get("created")?.[0]).toMatchObject({ change: "creation" });
    await write.execute(
      "overwrite",
      { path: "new", content: "other\n" },
      undefined,
      undefined,
      context
    );
    expect(facts.get("overwrite")?.[0]).toMatchObject({ change: "modification" });
    expect(facts.get("overwrite")?.[0]).toHaveProperty("patch", expect.stringContaining("-new"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
