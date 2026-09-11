import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAgentSession,
  createReadToolDefinition,
  createSyntheticSourceInfo,
  DefaultResourceLoader,
  initTheme,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  ToolExecutionComponent,
  type AgentSession,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, Text, type TUI } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import toolDisplay from "./index.ts";
import { installBuiltinDisplays } from "./replay.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];
type LookupSession = Pick<AgentSession, "getAllTools"> & {
  getToolDefinition: (name: string) => RenderDefinition;
};

// Exercise the actual TUI lookup without starting a terminal or an agent turn.
const host = InteractiveMode.prototype as unknown as {
  getRegisteredToolDefinition: (this: { session: LookupSession }, name: string) => RenderDefinition;
};

function lookupSession(name = "read", source = "builtin"): LookupSession {
  const definition = { ...createReadToolDefinition("/tmp"), name };
  return {
    getToolDefinition: () => definition,
    getAllTools: () => [{ ...definition, sourceInfo: createSyntheticSourceInfo(name, { source }) }]
  };
}

function readRow(session: AgentSession, completed = true): ToolExecutionComponent {
  const definition = host.getRegisteredToolDefinition.call({ session }, "read");
  const ui = { requestRender: () => {} } as TUI;
  const row = new ToolExecutionComponent(
    "read",
    "read-1",
    { path: "example.txt" },
    { showImages: false },
    definition,
    ui,
    session.sessionManager.getCwd()
  );
  if (completed) {
    row.updateResult({
      content: [{ type: "text", text: "retained file content\n" }],
      isError: false
    });
  }
  return row;
}

function text(row: ToolExecutionComponent): string {
  return row.render(80).map(stripTerminalSequences).join("\n");
}

function preserveRegistry(session: AgentSession): () => void {
  const tools = structuredClone(session.getAllTools());
  const definitions = tools.map(({ name }) => {
    const definition = session.getToolDefinition(name);
    return { name, definition, fields: { ...definition } };
  });
  const active = [...session.agent.state.tools];
  const prompt = session.systemPrompt;
  return () => {
    expect(session.getAllTools()).toEqual(tools);
    for (const { name, definition, fields } of definitions) {
      expect(session.getToolDefinition(name)).toBe(definition);
      expect(definition).toEqual(fields);
      const view = host.getRegisteredToolDefinition.call({ session }, name);
      if (!view || !("execute" in view)) throw new Error("Expected execution definition");
      expect(view.execute === definition?.execute).toBe(true);
      expect(view.parameters).toBe(definition?.parameters);
      expect(view.promptSnippet).toBe(definition?.promptSnippet);
      expect(view.promptGuidelines).toBe(definition?.promptGuidelines);
      expect(view.prepareArguments).toBe(definition?.prepareArguments);
    }
    expect(session.getActiveToolNames()).toEqual(active.map(({ name }) => name));
    session.agent.state.tools.forEach((tool, index) => {
      expect(tool).toBe(active[index]);
    });
    expect(session.systemPrompt).toBe(prompt);
  };
}

async function withSession(
  run: (fixture: {
    session: AgentSession;
    extensionFactories: ((pi: ExtensionAPI) => void)[];
    assertNoRegistration: () => void;
  }) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "pi-tool-display-"));
  const agentDir = join(directory, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const registrations: ReturnType<typeof vi.spyOn>[] = [];
  const extensionFactories = [
    (pi: ExtensionAPI) => {
      registrations.push(vi.spyOn(pi, "registerTool"), vi.spyOn(pi, "setActiveTools"));
      toolDisplay(pi);
    }
  ];
  let session: AgentSession | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({
      shellPath: "/bin/bash",
      shellCommandPrefix: "export TOOL_DISPLAY_TEST=preserved",
      images: { autoResize: false }
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd: directory,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories
    });
    await resourceLoader.reload();
    expect(resourceLoader.getExtensions().errors).toEqual([]);
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-store.json"),
      refreshOnCreate: false,
      allowModelNetwork: false
    });
    const created = await createAgentSession({
      cwd: directory,
      agentDir,
      settingsManager,
      resourceLoader,
      modelRuntime,
      sessionManager: SessionManager.inMemory(directory)
    });
    session = created.session;
    initTheme("dark", false);
    await run({
      session,
      extensionFactories,
      assertNoRegistration: () => {
        expect(registrations.length).toBeGreaterThan(0);
        for (const registration of registrations) expect(registration).not.toHaveBeenCalled();
      }
    });
  } finally {
    await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
}

it("preserves live and restored cards and native registries through initialization, two reloads, and removal", async () => {
  const originalLookup = host.getRegisteredToolDefinition;
  await withSession(async ({ session, extensionFactories, assertNoRegistration }) => {
    const errors: unknown[] = [];
    let assertPreserved = preserveRegistry(session);
    // Startup reconstruction also happens before session_start.
    expect(text(readRow(session))).toContain("• Read example.txt");
    await session.bindExtensions({
      mode: "tui",
      onError: (error) => {
        errors.push(error);
      }
    });
    assertNoRegistration();
    assertPreserved();
    const activeNames = session.getActiveToolNames();
    expect(activeNames).not.toContain("grep");
    expect(session.getToolDefinition("grep")).toBeDefined();

    const live = readRow(session, false);
    live.setArgsComplete();
    live.markExecutionStarted();
    expect(text(live)).toContain("◦ Reading example.txt");
    live.updateResult({ content: [{ type: "text", text: "live file content" }], isError: false });
    expect(text(live)).toContain("• Read example.txt");
    expect(text(live)).not.toContain("live file content");
    live.setExpanded(true);
    expect(text(live)).toContain("live file content");

    for (let reload = 0; reload < 2; reload++) {
      let restored: ToolExecutionComponent | undefined;
      await session.reload({
        beforeSessionStart: () => {
          // Pi rebuilds its definitions on reload; compare identity within each runtime.
          assertPreserved = preserveRegistry(session);
          restored = readRow(session);
        }
      });
      assertNoRegistration();
      assertPreserved();
      if (!restored) throw new Error("Expected transcript restoration during reload");
      restored.invalidate();
      expect(text(restored)).toContain("• Read example.txt");
      expect(text(restored)).not.toContain("retained file content");
      restored.setExpanded(true);
      expect(text(restored)).toContain("retained file content");
      restored.setExpanded(false);
      expect(text(restored)).not.toContain("retained file content");
      expect(text(readRow(session))).toContain("• Read example.txt");
      expect(session.getActiveToolNames()).toEqual(activeNames);
      expect(errors).toEqual([]);
    }

    extensionFactories.length = 0;
    await session.reload({
      beforeSessionStart: () => {
        assertPreserved = preserveRegistry(session);
      }
    });
    assertPreserved();
    assertNoRegistration();
    expect(host.getRegisteredToolDefinition).toBe(originalLookup);
    expect(text(readRow(session))).not.toContain("• Read example.txt");
    expect(session.getActiveToolNames()).toEqual(activeNames);
  });
});

it("keeps Pi's configured execution, updates, results, failures, and cancellation", async () => {
  await withSession(async ({ session, assertNoRegistration }) => {
    const assertPreserved = preserveRegistry(session);
    await session.bindExtensions({ mode: "tui" });
    assertNoRegistration();
    assertPreserved();
    const directory = session.sessionManager.getCwd();
    const edit = session.agent.state.tools.find(({ name }) => name === "edit");
    const bash = session.agent.state.tools.find(({ name }) => name === "bash");
    if (!edit || !bash) throw new Error("Expected native tools");
    await writeFile(join(directory, "example.txt"), "before\n");
    const edited = await edit.execute("edit-1", {
      path: "example.txt",
      edits: [{ oldText: "before", newText: "after" }]
    });
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
      }
    );
    expect(output.content).toEqual([{ type: "text", text: `preserved\n${directory}\n` }]);
    expect(updates.length).toBeGreaterThan(0);
    await expect(bash.execute("bash-2", { command: "exit 7" })).rejects.toThrow(
      "Command exited with code 7"
    );
    await expect(
      edit.execute(
        "edit-2",
        { path: "example.txt", edits: [{ oldText: "after", newText: "never" }] },
        AbortSignal.abort()
      )
    ).rejects.toThrow("aborted");
    expect(await readFile(join(directory, "example.txt"), "utf8")).toBe("after\n");
  });
});

it.each(["print", "json", "rpc"] as const)(
  "removes the hook in %s mode, including reload",
  async (mode) => {
    const original = host.getRegisteredToolDefinition;
    await withSession(async ({ session, assertNoRegistration }) => {
      const assertPreserved = preserveRegistry(session);
      await session.bindExtensions({ mode, onError: () => {} });
      expect(host.getRegisteredToolDefinition).toBe(original);
      assertPreserved();
      await session.reload();
      expect(host.getRegisteredToolDefinition).toBe(original);
      assertNoRegistration();
    });
  }
);

it("leaves external owner rendering untouched, including built-in names and inherited slots", () => {
  const original = host.getRegisteredToolDefinition;
  const dispose = installBuiltinDisplays();
  try {
    for (const name of ["read", "external_tool"]) {
      for (const source of ["remote-extension", "sdk"]) {
        for (const renderers of [
          {},
          { renderCall: () => new Text("owner call") },
          { renderResult: () => new Text("owner result") }
        ]) {
          const definition = Object.freeze({
            ...createReadToolDefinition("/tmp"),
            name,
            ...renderers
          });
          const session = { ...lookupSession(name, source), getToolDefinition: () => definition };
          const previous = original.call({ session }, name);
          expect(host.getRegisteredToolDefinition.call({ session }, name)).toEqual(previous);
        }
      }
    }
    const session = lookupSession("unknown_builtin");
    const previous = original.call({ session }, "unknown_builtin");
    expect(host.getRegisteredToolDefinition.call({ session }, "unknown_builtin")).toBe(previous);
  } finally {
    dispose?.();
  }
});

it.each(["missing", "non-writable"])(
  "reports a %s lookup without registering tools",
  async (availability) => {
    const descriptor = Object.getOwnPropertyDescriptor(host, "getRegisteredToolDefinition");
    if (!descriptor) throw new Error("Expected Pi lookup");
    Object.defineProperty(host, "getRegisteredToolDefinition", {
      ...descriptor,
      ...(availability === "missing" ? { value: undefined } : { writable: false })
    });
    try {
      await withSession(async ({ session, assertNoRegistration }) => {
        const notify = vi.fn();
        await session.bindExtensions({
          mode: "tui",
          uiContext: { notify } as unknown as ExtensionContext["ui"]
        });
        expect(notify).toHaveBeenCalledWith(
          expect.stringContaining("keeping original rendering"),
          "warning"
        );
        assertNoRegistration();
        expect(host.getRegisteredToolDefinition).toBe(
          availability === "missing" ? undefined : descriptor.value
        );
      });
    } finally {
      Object.defineProperty(host, "getRegisteredToolDefinition", descriptor);
    }
  }
);

it("returns an available original view when decoration fails and never retries a failing previous lookup", () => {
  const original = host.getRegisteredToolDefinition;
  const session = lookupSession();
  const view = original.call({ session }, "read");
  const previous = vi.fn().mockReturnValue(view);
  host.getRegisteredToolDefinition = previous;
  const dispose = installBuiltinDisplays();
  try {
    session.getAllTools = () => {
      throw new Error("ownership unavailable");
    };
    expect(host.getRegisteredToolDefinition.call({ session }, "read")).toBe(view);
    expect(previous).toHaveBeenCalledTimes(1);

    session.getAllTools = lookupSession().getAllTools;
    const invalidView = Object.defineProperty({}, "renderCall", {
      enumerable: true,
      get: () => {
        throw new Error("cannot copy view");
      }
    });
    previous.mockReturnValue(invalidView);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")).toBe(invalidView);
    expect(previous).toHaveBeenCalledTimes(2);

    previous.mockReturnValue(undefined);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")).toBeUndefined();
    expect(previous).toHaveBeenCalledTimes(3);

    const failure = new Error("previous lookup failed");
    previous.mockImplementation(() => {
      throw failure;
    });
    expect(() => host.getRegisteredToolDefinition.call({ session }, "read")).toThrow(failure);
    expect(previous).toHaveBeenCalledTimes(4);
  } finally {
    dispose?.();
    host.getRegisteredToolDefinition = original;
  }
});

it("replaces repeated installations and preserves later wrappers during repeated disposal and reinstallation", () => {
  const original = host.getRegisteredToolDefinition;
  const firstDispose = installBuiltinDisplays();
  const secondDispose = installBuiltinDisplays();
  let thirdDispose: (() => void) | undefined;
  try {
    firstDispose?.();
    const installed = host.getRegisteredToolDefinition;
    expect(installed).not.toBe(original);
    const laterWrapper: typeof installed = function (name) {
      return installed.call(this, name);
    };
    host.getRegisteredToolDefinition = laterWrapper;
    secondDispose?.();
    secondDispose?.();
    expect(host.getRegisteredToolDefinition).toBe(laterWrapper);
    const session = lookupSession();
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).not.toBe(
      "self"
    );

    thirdDispose = installBuiltinDisplays();
    secondDispose?.();
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).toBe("self");
    thirdDispose?.();
    thirdDispose?.();
    expect(host.getRegisteredToolDefinition).toBe(laterWrapper);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).not.toBe(
      "self"
    );
  } finally {
    firstDispose?.();
    secondDispose?.();
    thirdDispose?.();
    host.getRegisteredToolDefinition = original;
  }
});
