import { mkdirSync, renameSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createBashToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
  SessionManager,
  type ExtensionContext,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { parsePatch } from "./diff.ts";
import type { DisplayFact } from "./display-model.ts";
import { observeNativeDefinition } from "./native-observation.ts";

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
      original as unknown as ToolDefinition,
      { cwd: directory, shellPath: "/bin/bash", commandPrefix: "export DISPLAY_TEST=preserved" },
      () => ({
        started() {},
        fact: (value) => facts.push(value),
        preview: (value) => previews.push(value.text)
      })
    );
    const context = {
      cwd: directory,
      sessionManager: SessionManager.inMemory(directory)
    } as unknown as ExtensionContext;
    const params = { command: 'printf "α\\r\\n%s\\n%s" "$DISPLAY_TEST" "$PI_SESSION_ID"' };
    const expected = await original.execute("plain", params, undefined, undefined, context);
    const updates: unknown[] = [];
    expect(
      await observed.execute("observed", params, undefined, (value) => updates.push(value), context)
    ).toEqual(expected);
    expect(updates.length).toBeGreaterThan(0);
    expect(previews.at(-1)).toContain("α\r\npreserved");
    expect(facts).toContainEqual(
      expect.objectContaining({ kind: "operation", outcome: "success", exitCode: 0 })
    );
    await expect(
      observed.execute("error", { command: "exit 7" }, undefined, undefined, context)
    ).rejects.toThrow("Command exited with code 7");
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
    await expect(
      observed.execute("cancel", { command: "sleep 3" }, AbortSignal.abort(), undefined, context)
    ).rejects.toThrow("aborted");
    expect(facts.at(-1)).toMatchObject({ outcome: "cancelled" });
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
          ? createEditToolDefinition(directory)
          : createWriteToolDefinition(directory);
      const observed = observeNativeDefinition(
        original as unknown as ToolDefinition,
        { cwd: directory },
        () => ({
          started() {},
          preview() {},
          fact: (fact) => facts.push(fact)
        })
      );
      const result = await observed.execute(
        "bom",
        name === "edit"
          ? { path: "file", edits: [{ oldText: "before", newText: "after" }] }
          : { path: "file", content: after },
        undefined,
        undefined,
        { cwd: directory } as ExtensionContext
      );
      expect(await readFile(join(directory, "file"), "utf8")).toBe(after);
      const change = facts.find((fact) => fact.kind === "change");
      expect(change?.availability).toBe("available");
      if (name === "edit") expect(change!.patch).toBe((result.details as { patch: string }).patch);
      const bom = name === "write" ? "\uFEFF" : "";
      expect(parsePatch(change!.patch!)?.hunks[0]?.lines).toEqual([
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
      { length: 900 },
      (_, index) => `line ${index} ${"x".repeat(80)}\n`
    ).join("");
    const after = before.replace("line 450 ", "changed 450 ");
    await writeFile(join(directory, "file"), before);
    const facts: DisplayFact[] = [];
    const observed = observeNativeDefinition(
      createEditToolDefinition(directory) as unknown as ToolDefinition,
      { cwd: directory },
      () => ({ started() {}, preview() {}, fact: (fact) => facts.push(fact) })
    );
    const result = await observed.execute(
      "large-edit",
      { path: "file", edits: [{ oldText: "line 450 ", newText: "changed 450 " }] },
      undefined,
      undefined,
      { cwd: directory } as ExtensionContext
    );
    expect(await readFile(join(directory, "file"), "utf8")).toBe(after);
    const change = facts.find((fact) => fact.kind === "change");
    expect(change).toMatchObject({
      availability: "available",
      patch: (result.details as { patch: string }).patch
    });
    expect(parsePatch(change!.patch!)).toMatchObject({ added: 1, removed: 1 });
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
    const observed = observeNativeDefinition(
      createEditToolDefinition(directory) as unknown as ToolDefinition,
      { cwd: directory },
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
        { cwd: directory } as ExtensionContext
      )
    ).rejects.toMatchObject({ code: "EISDIR" });
    expect(facts).toContainEqual(
      expect.objectContaining({ kind: "operation", outcome: "failure" })
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        kind: "change",
        availability: "available",
        patch: expect.stringContaining("+after")
      })
    );
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
      const write = observeNativeDefinition(
        createWriteToolDefinition(directory) as unknown as ToolDefinition,
        { cwd: directory },
        () => ({ started() {}, preview() {}, fact: (fact) => facts.push(fact) })
      );
      const context = { cwd: directory } as ExtensionContext;
      await writeFile(path, "before\n", { mode: 0o400 });
      await expect(
        write.execute("failed-write", { path, content: "after\n" }, undefined, undefined, context)
      ).rejects.toThrow();
      expect(facts).toEqual([
        expect.objectContaining({
          kind: "change",
          availability: "available",
          patch: expect.stringContaining("-before")
        }),
        expect.objectContaining({ kind: "operation", outcome: "failure" })
      ]);
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
      expect(facts[0]).toMatchObject({ kind: "change", availability: "unavailable" });
      expect(facts.at(-1)).toMatchObject({ kind: "operation", outcome: "success" });
      await chmod(path, 0o600);
      expect(await readFile(path, "utf8")).toBe("written\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it("preserves queued mutations, aliases, CRLF, cancellation, and observer failures", async () => {
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
    const edit = observeNativeDefinition(
      createEditToolDefinition(directory) as unknown as ToolDefinition,
      { cwd: directory },
      begin
    );
    const write = observeNativeDefinition(
      createWriteToolDefinition(directory) as unknown as ToolDefinition,
      { cwd: directory },
      begin
    );
    const context = { cwd: directory } as ExtensionContext;
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
    expect(
      outputs.every((value) => typeof (value.details as { patch: string }).patch === "string")
    ).toBe(true);
    expect(facts.get("first")?.find((fact) => fact.kind === "change")).toMatchObject({
      kind: "change",
      availability: "available",
      patch: expect.stringContaining("+ALPHA")
    });
    await expect(
      edit.execute(
        "bad-match",
        { path: "file", edits: [{ oldText: "missing", newText: "never" }] },
        undefined,
        undefined,
        context
      )
    ).rejects.toThrow();
    expect(facts.has("bad-match")).toBe(false);
    await expect(
      edit.execute(
        "no-change",
        { path: "file", edits: [{ oldText: "ALPHA", newText: "ALPHA" }] },
        undefined,
        undefined,
        context
      )
    ).rejects.toThrow();
    expect(facts.has("no-change")).toBe(false);
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
    await Promise.all([
      write.execute(
        "queued-write-1",
        { path: "file", content: "first replacement\n" },
        undefined,
        undefined,
        context
      ),
      write.execute(
        "queued-write-2",
        { path: "alias", content: "second replacement\n" },
        undefined,
        undefined,
        context
      )
    ]);
    expect(facts.get("queued-write-2")?.[0]).toMatchObject({
      patch: expect.stringContaining("-first replacement")
    });
    expect(await readFile(join(directory, "file"), "utf8")).toBe("second replacement\n");
    await write.execute(
      "oversized",
      { path: "file", content: "x".repeat(64 * 1024 + 1) },
      undefined,
      undefined,
      context
    );
    expect(facts.get("oversized")?.[0]).toMatchObject({ availability: "unavailable" });
    expect((await readFile(join(directory, "file"))).length).toBe(64 * 1024 + 1);
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
    expect(facts.get("overwrite")?.[0]).toMatchObject({
      change: "modification",
      patch: expect.stringContaining("-new")
    });
    const failingObserver = observeNativeDefinition(
      createWriteToolDefinition(directory) as unknown as ToolDefinition,
      { cwd: directory },
      () => ({
        started() {
          throw new Error("display");
        },
        fact() {
          throw new Error("display");
        },
        preview() {}
      })
    );
    await failingObserver.execute(
      "capture-failed",
      { path: "new", content: "preserved" },
      undefined,
      undefined,
      context
    );
    expect(await readFile(join(directory, "new"), "utf8")).toBe("preserved");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
