import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createEditToolDefinition,
  createSyntheticSourceInfo,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { registerBuiltinDisplays } from "./builtins.ts";

function registry(sources: Record<string, string>, activeNames: string[]) {
  const registered = new Map<string, Omit<ToolDefinition, "renderCall" | "renderResult">>();
  let active = [...activeNames];
  const api: Parameters<typeof registerBuiltinDisplays>[0] = {
    getAllTools: () =>
      Object.entries(sources).map(([name, source]) => ({
        name,
        description: name,
        parameters: {},
        sourceInfo: createSyntheticSourceInfo(name, { source })
      })),
    getActiveTools: () => [...active],
    registerTool: ((tool) => {
      registered.set(tool.name, tool);
      active.push(tool.name);
    }) satisfies ExtensionAPI["registerTool"],
    setActiveTools: (names) => {
      active = [...names];
    }
  };
  return { api, registered };
}

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("built-in registration", () => {
  it("preserves the active set and skips extension/SDK definitions with built-in names", () => {
    const { api, registered } = registry(
      { read: "builtin", edit: "builtin", bash: "remote-extension", write: "sdk" },
      ["bash", "read"]
    );
    registerBuiltinDisplays(api, "/tmp", SettingsManager.inMemory());
    expect([...registered.keys()]).toEqual(["read", "edit"]);
    expect(api.getActiveTools()).toEqual(["bash", "read"]);
    const original = createEditToolDefinition("/tmp");
    const edit = registered.get("edit");
    expect(edit).toMatchObject({
      description: original.description,
      parameters: original.parameters,
      promptSnippet: original.promptSnippet,
      promptGuidelines: original.promptGuidelines,
      renderShell: "self"
    });
    expect(edit?.prepareArguments?.({ path: "file", oldText: "before", newText: "after" })).toEqual(
      original.prepareArguments?.({ path: "file", oldText: "before", newText: "after" })
    );
  });

  it("delegates file edits, shell settings, updates, failures, and cancellation to Pi", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-tool-display-"));
    directories.push(directory);
    const { api, registered } = registry({ edit: "builtin", bash: "builtin" }, ["edit", "bash"]);
    registerBuiltinDisplays(
      api,
      "/unused-factory-directory",
      SettingsManager.inMemory({
        shellPath: "/bin/bash",
        shellCommandPrefix: "export TOOL_DISPLAY_TEST=preserved"
      })
    );
    // These built-ins consume cwd and session metadata only.
    const partialContext: Partial<ExtensionContext> = {
      cwd: directory,
      sessionManager: SessionManager.inMemory(directory)
    };
    const context = partialContext as ExtensionContext;
    const edit = registered.get("edit");
    const bash = registered.get("bash");
    expect(edit).toBeDefined();
    expect(bash).toBeDefined();
    if (!edit || !bash) throw new Error("Expected built-in definitions");
    await writeFile(join(directory, "example.txt"), "before\n");
    const edited = await edit.execute(
      "edit-1",
      { path: "example.txt", edits: [{ oldText: "before", newText: "after" }] },
      undefined,
      undefined,
      context
    );
    expect(await readFile(join(directory, "example.txt"), "utf8")).toBe("after\n");
    expect(edited.details).toMatchObject({
      firstChangedLine: 1,
      diff: expect.stringContaining("+1 after"),
      patch: expect.stringContaining("+after")
    });
    const updates: unknown[] = [];
    const output = await bash.execute(
      "bash-1",
      { command: 'printf "%s\\n" "$TOOL_DISPLAY_TEST"; pwd', timeout: 5 },
      undefined,
      (update) => {
        updates.push(update);
      },
      context
    );
    expect(output.content).toEqual([{ type: "text", text: `preserved\n${directory}\n` }]);
    expect(updates.length).toBeGreaterThan(0);
    await expect(
      bash.execute("bash-2", { command: "exit 7" }, undefined, undefined, context)
    ).rejects.toThrow("Command exited with code 7");
    await expect(
      edit.execute(
        "edit-2",
        { path: "example.txt", edits: [{ oldText: "after", newText: "never" }] },
        AbortSignal.abort(),
        undefined,
        context
      )
    ).rejects.toThrow("aborted");
    expect(await readFile(join(directory, "example.txt"), "utf8")).toBe("after\n");
  });
});
