import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  createReadToolDefinition,
  createSyntheticSourceInfo,
  defineTool,
  DefaultResourceLoader,
  initTheme,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  ToolExecutionComponent,
  AgentSession,
  AssistantMessageComponent,
  type AgentSessionRuntime,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { type Container, stripTerminalSequences, Text, type TUI } from "@earendil-works/pi-tui";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import { useStepPatchDeadline } from "@pi-mono/libs/validation/bounded-diff";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";

import toolDisplay from "../index.ts";
import { assistantMessage, messageToolCall, renderingTui } from "../test-fixture.ts";
import { CALL_TYPE, WRITER_TYPE } from "../transcript/metadata.ts";
import { DisplaySession } from "../transcript/session.ts";
import { DisplayCollectors } from "./collection.ts";
import { hostHook, interactivePrototype, type Host } from "./compatibility.ts";
import { displaySettings } from "./configuration.ts";
import { installHostIntegration as installHostHooks } from "./install.ts";

function installHostIntegration(): (() => void) | undefined {
  const collection = new DisplayCollectors();
  const dispose = installHostHooks(collection);

  if (!dispose) {
    void collection.dispose();

    return;
  }

  return () => {
    dispose();
    void collection.dispose();
  };
}

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

type LookupSession = Pick<AgentSession, "getAllTools" | "settingsManager" | "sessionManager"> & {
  getToolDefinition: (name: string) => ReturnType<AgentSession["getToolDefinition"]>;
  extensionRunner: Pick<AgentSession["extensionRunner"], "resolveToolRenderers">;
};

// Pi 1.3.0's lookup is private; exercise its actual implementation without starting a terminal.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const host = InteractiveMode.prototype as unknown as {
  getRegisteredToolDefinition: (this: { session: LookupSession }, name: string) => RenderDefinition;
};

function lookupSession(name = "read", source = "builtin"): LookupSession {
  const definition = defineTool({ ...createReadToolDefinition("/tmp"), name });

  return {
    settingsManager: SettingsManager.inMemory(),
    sessionManager: SessionManager.inMemory("/tmp"),
    getToolDefinition: () => definition,
    // No extension registers a tool renderer resolver, so Pi's base lookup decides.
    extensionRunner: { resolveToolRenderers: (_name, base) => base() },
    getAllTools: () => [
      { ...definition, exposure: "direct", sourceInfo: createSyntheticSourceInfo(name, { source }) }
    ]
  };
}

function readRow(session: AgentSession, completed = true): ToolExecutionComponent {
  const definition = host.getRegisteredToolDefinition.call({ session }, "read");
  const ui = renderingTui();
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

function interactiveHost(session: AgentSession, tuiMode: TUI["mode"] = "fullscreen") {
  const runtime = {
    session,
    setBeforeSessionInvalidate() {},
    setRebindSession() {}
  } satisfies Pick<
    AgentSessionRuntime,
    "session" | "setBeforeSessionInvalidate" | "setRebindSession"
  >;
  // Construction only reads the session and registers these lifecycle callbacks.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const mode = new InteractiveMode(runtime as AgentSessionRuntime);
  // Exercise Pi 1.3.0's private reconstruction/event paths without terminal startup.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const boundary = mode as unknown as Host & {
    ui: TUI;
    isInitialized: boolean;
    chatContainer: Container;
    footerDataProvider: { dispose(): void };
    renderSessionItems(items: unknown[]): void;
    renderSessionEntries(entries: ReturnType<SessionManager["buildContextEntries"]>): void;
    handleEvent(event: AgentSessionEvent): Promise<void>;
    hideThinkingBlock: boolean;
    updateThinkingBlockVisibility(): void;
    toggleThinkingBlockVisibility(): void;
  };
  boundary.ui = renderingTui(tuiMode);
  boundary.isInitialized = true;

  return boundary;
}

function text(row: ToolExecutionComponent): string {
  return row.render(80).map(stripTerminalSequences).join("\n");
}

/** Data of this extension's session entries of one type. */
function saved(session: AgentSession, type: string): unknown[] {
  return session.sessionManager
    .getEntries()
    .flatMap((entry) => (entry.type === "custom" && entry.customType === type ? [entry.data] : []));
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
      expect(view.constrainedSampling).toBe(definition?.constrainedSampling);
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
    agentDir: string;
  }) => Promise<void>,
  displayConfiguration?: unknown,
  baseToolsOverride?: ConstructorParameters<typeof AgentSession>[0]["baseToolsOverride"],
  builtinExtensions: readonly InlineExtension[] = [],
  persisted = false
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

  // Card contracts use compact mode unless a test selects another collapsed mode.
  const display: Record<string, unknown> = {
    "ext.pi-tool-display":
      displayConfiguration !== null && typeof displayConfiguration === "object"
        ? { collapsedMode: "compact", ...displayConfiguration }
        : (displayConfiguration ?? { collapsedMode: "compact" })
  };

  try {
    const settingsManager = SettingsManager.inMemory({
      // Windows has no /bin/bash; Pi finds Git Bash there when shellPath is unset.
      ...(process.platform === "win32" ? {} : { shellPath: "/bin/bash" }),
      shellCommandPrefix: "export TOOL_DISPLAY_TEST=preserved",
      images: { autoResize: false },
      ...display
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
      // Built-ins load through their `builtin:<name>` paths, which give their tools builtin provenance.
      additionalExtensionPaths: builtinExtensions.map(({ name }) => `builtin:${name}`),
      // Pi snapshots the factory list; this fixture deliberately changes registrations on reload.
      extensionFactories: [
        ...builtinExtensions,
        (pi) => {
          for (const factory of extensionFactories) factory(pi);
        }
      ]
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
      sessionManager: persisted
        ? SessionManager.create(directory, join(directory, "sessions"))
        : SessionManager.inMemory(directory)
    });
    session = created.session;

    if (baseToolsOverride) {
      created.session.dispose();
      session = new AgentSession({
        agent: created.session.agent,
        sessionManager: created.session.sessionManager,
        settingsManager,
        resourceLoader,
        modelRuntime,
        cwd: directory,
        baseToolsOverride
      });
    }

    initTheme("dark", false);
    await run({
      session,
      extensionFactories,
      agentDir,
      assertNoRegistration: () => {
        expect(registrations.length).toBeGreaterThan(0);
        for (const registration of registrations) expect(registration).not.toHaveBeenCalled();
      }
    });
  } finally {
    try {
      await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    } finally {
      try {
        session?.dispose();
      } finally {
        vi.unstubAllEnvs();
        await rm(directory, { recursive: true, force: true });
      }
    }
  }
}

it("preserves live and restored cards and native registries through initialization, two reloads, and removal", async () => {
  const originalLookup = host.getRegisteredToolDefinition;
  await withSession(async ({ session, extensionFactories, assertNoRegistration }) => {
    const errors: unknown[] = [];
    let assertPreserved = preserveRegistry(session);
    // Startup reconstruction also happens before session_start.
    expect(text(readRow(session))).toContain("• Read example.txt");
    assertPreserved();
    await session.bindExtensions({
      mode: "tui",
      onError: (error) => {
        errors.push(error);
      }
    });
    // Session start now installs verified native observation in every mode.
    assertPreserved = preserveRegistry(session);
    assertNoRegistration();
    assertPreserved();
    const activeNames = session.getActiveToolNames();
    expect(activeNames).not.toContain("grep");
    expect(session.getToolDefinition("grep")).toBeDefined();

    const live = readRow(session, false);
    live.setArgsComplete();
    live.markExecutionStarted();
    expect(text(live)).toContain("• Reading example.txt");
    live.updateResult({ content: [{ type: "text", text: "live file content" }], isError: false });
    expect(text(live)).toContain("• Read example.txt");
    expect(text(live)).not.toContain("live file content");
    live.setExpanded(true);
    expect(text(live)).toContain("live file content");
    expect(text(live)).not.toContain('"path"');

    for (let reload = 0; reload < 2; reload++) {
      let restored: ToolExecutionComponent | undefined;
      await session.reload({
        beforeSessionStart: () => {
          // Pi rebuilds its definitions on reload; compare identity within each runtime.
          assertPreserved = preserveRegistry(session);
          restored = readRow(session);
          assertPreserved();
        }
      });
      assertPreserved = preserveRegistry(session);
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

it("selects project display settings only while trusted, including invalid project sections", async () => {
  await withSession(
    async ({ session }) => {
      const manager = session.settingsManager;
      // Keep source values available independently of trust to exercise this adapter's gate.
      const project = {
        ...manager.getProjectSettings(),
        "ext.pi-tool-display": {
          collapsedMode: "summary",
          showParameters: true,
          rendererOverrides: { read: "auto" }
        }
      };
      const projectRead = vi.spyOn(manager, "getProjectSettings").mockReturnValue(project);
      const global = {
        valid: true,
        collapsedMode: "compact",
        showParameters: false,
        rendererOverrides: { read: "original", bash: "generic" },
        warnings: []
      };

      try {
        manager.setProjectTrusted(false);
        expect(displaySettings(session)).toEqual(global);
        expect(projectRead).not.toHaveBeenCalled();
        manager.setProjectTrusted(true);
        expect(displaySettings(session)).toEqual({
          valid: true,
          collapsedMode: "summary",
          showParameters: true,
          rendererOverrides: { read: "auto", bash: "generic" },
          warnings: []
        });
        const invalidProject = {
          ...project,
          "ext.pi-tool-display": { showParameters: "invalid" }
        };
        projectRead.mockReturnValue(invalidProject);
        expect(displaySettings(session)).toEqual({
          valid: false,
          collapsedMode: "summary",
          showParameters: false,
          rendererOverrides: {},
          warnings: [
            expect.stringContaining(
              `${join(session.sessionManager.getCwd(), ".pi", "settings.json")}: invalid ext.pi-tool-display.showParameters`
            )
          ]
        });
        projectRead.mockClear();
        manager.setProjectTrusted(false);
        expect(displaySettings(session)).toEqual(global);
        expect(projectRead).not.toHaveBeenCalled();
      } finally {
        projectRead.mockRestore();
      }
    },
    { rendererOverrides: { read: "original", bash: "generic" } }
  );
});

it("observes native calls through real transcript rows before Pi middleware wrapping", async () => {
  await withSession(async ({ session, assertNoRegistration }) => {
    const tui = interactiveHost(session);

    try {
      tui.renderSessionItems([]);
      await session.bindExtensions({ mode: "tui" });
      assertNoRegistration();
      const shellMessage = assistantMessage(
        [
          fauxToolCall(
            "bash",
            { command: 'printf "%s" "$TOOL_DISPLAY_TEST"' },
            { id: "native-shell" }
          )
        ],
        3
      );
      session.sessionManager.appendMessage(shellMessage);
      await tui.handleEvent({ type: "message_start", message: shellMessage });
      await tui.handleEvent({
        type: "message_update",
        message: shellMessage,
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: messageToolCall(shellMessage),
          partial: shellMessage
        }
      });
      await tui.handleEvent({ type: "message_end", message: shellMessage });
      const shell = session.agent.state.tools.find((tool) => tool.name === "bash")!;
      const result = await shell.execute("native-shell", {
        command: 'printf "%s" "$TOOL_DISPLAY_TEST"'
      });
      expect(result.content).toEqual([{ type: "text", text: "preserved" }]);
      await tui.handleEvent({
        type: "tool_execution_end",
        toolCallId: "native-shell",
        toolName: "bash",
        result,
        isError: false
      });
      const shellResult = {
        role: "toolResult" as const,
        toolCallId: "native-shell",
        toolName: "bash",
        content: result.content,
        isError: false,
        timestamp: 3
      };
      await tui.handleEvent({ type: "message_end", message: shellResult });
      // Pi's successful result implies exit 0, so only the writer entry is saved.
      expect(saved(session, WRITER_TYPE)).toHaveLength(1);
      expect(saved(session, CALL_TYPE)).toEqual([]);
      const shellRow = tui.chatContainer.children
        .filter((child) => child instanceof ToolExecutionComponent)
        .at(-1)!;
      shellRow.setExpanded(true);
      expect(text(shellRow)).toContain("Exit 0");
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["removal", "reconstruction"])(
  "preserves later row wrappers and native expansion after %s",
  async (transition) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        const message = assistantMessage([
          fauxToolCall("read", { path: "a.ts" }, { id: "first" }),
          fauxToolCall("read", { path: "b.ts" }, { id: "second" })
        ]);
        const history = [
          message,
          ...["first", "second"].map((toolCallId) => ({
            role: "toolResult",
            toolCallId,
            toolName: "read",
            content: [{ type: "text", text: "retained body" }],
            isError: false,
            timestamp: 2
          }))
        ];
        tui.renderSessionItems(history);
        const rows = tui.chatContainer.children.filter(
          (child) => child instanceof ToolExecutionComponent
        );
        const sibling = rows[1]!;
        const retainedRender = sibling.render.bind(sibling);
        const retainedMouse = sibling.handleMouse.bind(sibling);
        const retainedExpansion = sibling.setExpanded.bind(sibling);
        const render = vi.fn((width: number) => retainedRender(width));
        const mouse = vi.fn((event: Parameters<typeof sibling.handleMouse>[0]) =>
          retainedMouse(event)
        );
        const setExpanded = vi.fn((expanded: boolean) => retainedExpansion(expanded));
        sibling.render = render;
        sibling.handleMouse = mouse;
        sibling.setExpanded = setExpanded;
        expect(text(sibling)).toBe("  └ Read b.ts");
        sibling.setExpanded(true);
        expect(rows.every((row) => text(row).includes("retained body"))).toBe(true);
        sibling.setExpanded(false);
        expect(rows.every((row) => !text(row).includes("retained body"))).toBe(true);
        setExpanded.mockClear();

        if (transition === "removal")
          await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
        else {
          tui.chatContainer.clear();
          tui.renderSessionItems(history);
        }

        expect(sibling.render === render).toBe(true);
        expect(sibling.handleMouse === mouse).toBe(true);
        expect(sibling.setExpanded === setExpanded).toBe(true);
        expect(sibling.render(80)[0]).toBe("");
        sibling.handleMouse({
          type: "click",
          button: "left",
          x: 5,
          y: 1,
          screenX: 5,
          screenY: 1,
          width: 80,
          height: 2,
          shift: false,
          alt: false,
          ctrl: false
        });
        expect(setExpanded).toHaveBeenCalledExactlyOnceWith(true);
        expect(text(sibling)).toContain("retained body");
        expect(text(rows[0]!)).not.toContain("retained body");
        if (transition === "reconstruction")
          for (const row of tui.chatContainer.children)
            if (row instanceof ToolExecutionComponent)
              expect(text(row)).not.toContain("retained body");
        sibling.setExpanded(false);
        expect(text(sibling)).not.toContain("retained body");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it.each(["removal", "reconstruction"])(
  "keeps pending host events inert after %s",
  async (transition) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        const pending = tui.handleEvent({
          type: "message_start",
          message: assistantMessage([{ type: "text", text: "Outgoing assistant" }])
        });
        const outgoing = tui.streamingComponent!;
        let replacement: Promise<void> | undefined;
        let incoming: AssistantMessageComponent | undefined;

        if (transition === "removal") interactivePrototype()[hostHook]!();
        else {
          tui.chatContainer.clear();
          tui.renderSessionItems([]);
          replacement = tui.handleEvent({
            type: "message_start",
            message: assistantMessage([{ type: "text", text: "Incoming assistant" }], 2)
          });
          incoming = tui.streamingComponent;
        }

        await pending;
        await replacement;
        const rendered = (row: AssistantMessageComponent) =>
          row.render(80).map(stripTerminalSequences).join("\n");

        if (incoming) {
          expect(rendered(incoming)).toContain("• Incoming assistant");
          interactivePrototype()[hostHook]!();
          incoming.invalidate();
          expect(rendered(incoming)).not.toContain("•");
        }

        outgoing.invalidate();
        expect(rendered(outgoing)).toContain("Outgoing assistant");
        expect(rendered(outgoing)).not.toContain("•");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it("preserves native construction settings when settings change before TUI binding", async () => {
  await withSession(async ({ session }) => {
    const original = session.agent.state.tools.find((tool) => tool.name === "bash")!;
    // A nonzero exit code is saved only for an observed call.
    const args = { command: 'printf "%s" "$TOOL_DISPLAY_TEST"; exit 3' };
    session.settingsManager.setShellCommandPrefix("export TOOL_DISPLAY_TEST=changed");
    const expected = await original.execute("original-settings", args);
    expect(expected.content).toEqual([
      { type: "text", text: "preserved\n\nCommand exited with code 3" }
    ]);
    const tui = interactiveHost(session);

    try {
      tui.renderSessionItems([]);
      await session.bindExtensions({ mode: "tui" });
      const message = assistantMessage([fauxToolCall("bash", args, { id: "observed-settings" })]);
      session.sessionManager.appendMessage(message);
      await tui.handleEvent({ type: "message_start", message });
      await tui.handleEvent({ type: "message_end", message });
      const observed = session.agent.state.tools.find((tool) => tool.name === "bash")!;
      const result = await observed.execute("observed-settings", args);
      // Separate real shell runs can report different elapsed times.
      expect(result).toEqual({
        ...expected,
        structuredContent: {
          output: "preserved",
          truncated: false,
          exit_code: 3,
          wall_time_seconds: expect.any(Number) as unknown
        }
      });
      await tui.handleEvent({
        type: "tool_execution_end",
        toolCallId: "observed-settings",
        toolName: "bash",
        result,
        isError: true
      });
      const final = {
        role: "toolResult" as const,
        toolCallId: "observed-settings",
        toolName: "bash",
        content: result.content,
        isError: true,
        timestamp: 2
      };
      // Facts are saved with Pi's final result message, before Pi appends its entry.
      await tui.handleEvent({ type: "message_end", message: final });
      expect(saved(session, CALL_TYPE)).toEqual([
        { entry: expect.any(String) as unknown, toolCallId: "observed-settings", exitCode: 3 }
      ]);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["observation", "session-entry", "local-store"] as const)(
  "preserves a native result and thrown error when %s fails",
  async (failure) => {
    await withSession(
      async ({ session, agentDir, assertNoRegistration }) => {
        const manager = session.sessionManager;
        const args = { command: 'printf "%s" "$TOOL_DISPLAY_TEST"; exit 3' };
        const expected = await session.agent.state.tools
          .find((tool) => tool.name === "bash")!
          .execute("original-result", args);
        const path = join(manager.getCwd(), "blocked");
        await mkdir(path);
        const writeArgs = { path, content: "cannot replace a directory" };
        const originalError = await session.agent.state.tools
          .find((tool) => tool.name === "write")!
          .execute("original-error", writeArgs)
          .catch((error: unknown) => error);
        if (!(originalError instanceof Error)) throw new Error("Expected native write error");
        expect(originalError.message).toContain("EISDIR");

        const fail = () => {
          throw new Error("display failure");
        };

        const callbacks = { started: vi.fn(fail), fact: vi.fn(fail), preview: vi.fn(fail) };
        // The spy invokes the original method with the live display session.
        // oxlint-disable-next-line typescript/unbound-method
        const begin = DisplaySession.prototype.beginObservation;
        const observation = vi.spyOn(DisplaySession.prototype, "beginObservation");
        const append = manager.appendCustomEntry.bind(manager);
        const writes = vi.spyOn(manager, "appendCustomEntry");
        const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
        const uiContext = { notify } satisfies Pick<ExtensionContext["ui"], "notify">;
        const results: Extract<AgentSessionEvent, { type: "tool_execution_end" }>[] = [];
        const unsubscribe = session.subscribe((event) => {
          if (event.type === "tool_execution_end") results.push(event);
        });

        try {
          if (failure === "observation")
            observation.mockImplementation(function (this: DisplaySession, id, adapter) {
              return begin.call(this, id, adapter) ? callbacks : undefined;
            });
          if (failure === "session-entry")
            writes.mockImplementation((type, data) => {
              if (type === CALL_TYPE || type === WRITER_TYPE) return fail();

              return append(type, data);
            });

          if (failure === "local-store") {
            await mkdir(agentDir, { recursive: true });
            await writeFile(join(agentDir, "pi-tool-display"), "not a directory");
          }

          await session.bindExtensions({
            mode: "tui",
            // This scenario uses notifications, not dialogs or a terminal.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            uiContext: uiContext as unknown as ExtensionContext["ui"]
          });
          const faux = fauxProvider({ provider: "display-failure", models: [{ id: "offline" }] });
          session.modelRuntime.registerNativeProvider(faux.provider);
          await session.modelRuntime.refresh({ allowNetwork: false });
          await session.setModel(faux.getModel());
          faux.setResponses([
            fauxAssistantMessage([
              fauxToolCall("bash", args, { id: "native-result" }),
              fauxToolCall("write", writeArgs, { id: "native-error" })
            ]),
            fauxAssistantMessage("done")
          ]);
          await session.prompt("Run the native calls");
          const returned = results.find((event) => event.toolCallId === "native-result");
          expect(returned?.isError).toBe(true);
          expect(returned?.result).toEqual({
            ...expected,
            structuredContent: {
              output: "preserved",
              truncated: false,
              exit_code: 3,
              wall_time_seconds: expect.any(Number) as unknown
            }
          });
          expect(results.find((event) => event.toolCallId === "native-error")).toMatchObject({
            isError: true,
            result: { content: [{ type: "text", text: originalError.message }] }
          });
          expect(
            manager
              .getEntries()
              .flatMap((entry) =>
                entry.type === "message" && entry.message.role === "toolResult"
                  ? [entry.message.content]
                  : []
              )
          ).toEqual([expected.content, [{ type: "text", text: originalError.message }]]);

          if (failure === "observation") {
            expect(callbacks.started).toHaveBeenCalled();
            expect(callbacks.fact).toHaveBeenCalled();
            expect(callbacks.preview).toHaveBeenCalled();
          }

          if (failure === "session-entry") {
            expect(writes).toHaveBeenCalledWith(WRITER_TYPE, expect.any(Object));
            expect(writes).toHaveBeenCalledWith(
              CALL_TYPE,
              expect.objectContaining({ toolCallId: "native-result", exitCode: 3 })
            );
            expect(saved(session, CALL_TYPE)).toEqual([]);
          }

          if (failure === "local-store")
            await vi.waitFor(
              () =>
                expect(notify).toHaveBeenCalledWith(
                  expect.stringContaining("local call details cannot be saved"),
                  "warning"
                ),
              { timeout: STEP_TIMEOUT_MS }
            );
          assertNoRegistration();
        } finally {
          unsubscribe();
          observation.mockRestore();
          writes.mockRestore();
        }
      },
      undefined,
      undefined,
      [],
      true
    );
  }
);

it("keeps real SDK base overrides generic despite their builtin source label", async () => {
  const execute = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "SDK read" }],
    details: undefined
  }));
  const base = createReadToolDefinition("/unused");
  await withSession(
    async ({ session }) => {
      expect(session.getAllTools().find((tool) => tool.name === "read")?.sourceInfo.source).toBe(
        "builtin"
      );
      const original = session.getToolDefinition("read");
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([
          assistantMessage([fauxToolCall("read", { path: "not-a-native-path" }, { id: "sdk" })])
        ]);
        expect(session.getToolDefinition("read")).toBe(original);
        const row = tui.chatContainer.children.find(
          (child) => child instanceof ToolExecutionComponent
        )!;
        expect(text(row)).toContain("Call outcome unavailable read(");
        expect(text(row)).not.toContain("Explored");
        expect(
          (await session.agent.state.tools[0]!.execute("sdk", { path: "not-a-native-path" }))
            .content
        ).toEqual([{ type: "text", text: "SDK read" }]);
        expect(execute).toHaveBeenCalledOnce();
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    undefined,
    {
      read: {
        name: "read",
        label: base.label,
        description: base.description,
        parameters: base.parameters,
        execute
      }
    }
  );
});

it.each(["original", "generic", false])(
  "avoids observation and grouping for override %s",
  async (mode) => {
    await withSession(
      async ({ session }) => {
        const before = ["read", "bash", "edit", "write"].map((name) =>
          session.getToolDefinition(name)
        );
        const tui = interactiveHost(session);

        try {
          const message = assistantMessage([
            fauxToolCall(
              "write",
              { path: "new.txt", content: "unchanged execution" },
              { id: "skip-write" }
            )
          ]);
          session.sessionManager.appendMessage(message);
          tui.renderSessionItems([message]);
          before.forEach((definition) =>
            expect(session.getToolDefinition(definition!.name)).toBe(definition)
          );
          const tool = session.agent.state.tools.find((tool) => tool.name === "write")!;
          await tool.execute("skip-write", { path: "new.txt", content: "unchanged execution" });
          expect(saved(session, CALL_TYPE)).toEqual([]);
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      {
        rendererOverrides: Object.fromEntries(
          ["read", "bash", "powershell", "edit", "write"].map((name) => [name, mode])
        )
      }
    );
  }
);

it("refreshes native binding across two reconstructed reloads and preserves dynamic owners on removal", async () => {
  await withSession(async ({ session, extensionFactories, assertNoRegistration }) => {
    const tui = interactiveHost(session);
    const nativeRead = session.getToolDefinition("read");
    const originalShell = session.getToolDefinition("bash")!;

    try {
      tui.renderSessionItems([]);
      expect(session.getToolDefinition("read")).toBe(nativeRead);
      expect(session.getToolDefinition("bash")).not.toBe(originalShell);
      await session.bindExtensions({
        mode: "tui",
        onError: (error) => {
          throw new Error(error.error);
        }
      });

      for (let reload = 0; reload < 2; reload++) {
        await session.reload({
          beforeSessionStart: () => {
            tui.chatContainer.clear();
            tui.renderSessionItems([]);
          }
        });
        const shell = session.agent.state.tools.find((tool) => tool.name === "bash")!;
        expect(
          (
            await shell.execute("unobserved-direct-call", {
              command: 'printf "%s" "$TOOL_DISPLAY_TEST"'
            })
          ).content
        ).toEqual([{ type: "text", text: "preserved" }]);
      }

      assertNoRegistration();
      const ownerExecute = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "owner implementation" }],
        details: undefined
      }));
      const ownerRender = () => new Text("owner rendering");
      extensionFactories.push((pi) => {
        pi.on("session_start", () => {
          pi.registerTool({ ...originalShell, execute: ownerExecute, renderCall: ownerRender });
        });
      });
      await session.reload({
        beforeSessionStart: () => {
          tui.chatContainer.clear();
          tui.renderSessionItems([]);
        }
      });
      expect(session.getToolDefinition("bash")).toMatchObject({ execute: ownerExecute });
      expect(host.getRegisteredToolDefinition.call({ session }, "bash")?.renderCall).toBe(
        ownerRender
      );
      const shell = session.agent.state.tools.find((tool) => tool.name === "bash")!;
      expect((await shell.execute("owner-call", { command: "anything" })).content).toEqual([
        { type: "text", text: "owner implementation" }
      ]);
      expect(saved(session, CALL_TYPE)).toEqual([]);
      extensionFactories.length = 0;
      await session.reload({
        beforeSessionStart: () => {
          tui.chatContainer.clear();
          tui.renderSessionItems([]);
        }
      });
      expect(host.getRegisteredToolDefinition.call({ session }, "bash")?.renderShell).not.toBe(
        "self"
      );
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it("preserves later in-place native wrappers when removing observation", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);

    try {
      tui.renderSessionItems([]);
      const definition = session.getToolDefinition("bash")!;
      const execute = definition.execute.bind(definition);
      const laterExecute = vi.fn((...args: Parameters<typeof execute>) => execute(...args));
      definition.execute = laterExecute;
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      expect(session.getToolDefinition("bash")?.execute === laterExecute).toBe(true);
      const tool = session.agent.state.tools.find((tool) => tool.name === "bash")!;
      expect((await tool.execute("after-removal", { command: "printf retained" })).content).toEqual(
        [{ type: "text", text: "retained" }]
      );
      expect(laterExecute).toHaveBeenCalledOnce();
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it("leaves another mutation subscriber active after display shutdown", async () => {
  useStepPatchDeadline();
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);
    const changes: string[] = [];
    const subscriber = observeFileMutations({
      eligible: (candidate) => candidate.sessionManager === session.sessionManager,
      begin: () => ({
        maxSourceBytes: 1024,
        completed: (mutation) => {
          if (mutation.after.status === "ready") changes.push(mutation.after.text);
        }
      })
    });

    try {
      tui.renderSessionItems([]);
      subscriber.bind(session.sessionManager);

      const write = () => {
        const tool = session.agent.state.tools.find((value) => value.name === "write");
        if (!tool) throw new Error("Missing native write");

        return tool;
      };

      const args = { path: "shared.txt", content: "display and summary" };
      const call = fauxToolCall("write", args, { id: "shared-write" });
      const message = assistantMessage([call]);
      session.sessionManager.appendMessage(message);
      await tui.handleEvent({ type: "message_start", message });
      await tui.handleEvent({
        type: "message_update",
        message,
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: call,
          partial: message
        }
      });
      await tui.handleEvent({ type: "message_end", message });
      await write().execute(call.id, args);
      expect(changes).toEqual([args.content]);

      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      // Shutdown saves the observed change of the call that is still open.
      expect(saved(session, CALL_TYPE)).toMatchObject([
        { toolCallId: call.id, change: { kind: "creation" } }
      ]);
      await write().execute("after-display", { ...args, content: "summary remains" });
      expect(changes).toEqual([args.content, "summary remains"]);
      subscriber.dispose();
      await write().execute("after-both", { ...args, content: "no observers" });
      expect(changes).toHaveLength(2);
    } finally {
      subscriber.dispose();
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["thinking", "tool"])(
  "binds buffered calls before Pi creates their rows during a %s update",
  async (update) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);
      const thought = { type: "thinking" as const, thinking: "Buffered thinking" };
      const messages = [
        assistantMessage(
          [
            ...(update === "thinking" ? [thought] : []),
            fauxToolCall("bash", { command: "echo first" }, { id: "shell-1" }),
            fauxToolCall("bash", { command: "echo second" }, { id: "shell-2" }),
            fauxToolCall("read", { path: "src/types.ts" }, { id: "read-1" })
          ],
          1
        ),
        assistantMessage(
          [thought, fauxToolCall("read", { path: "src/tool-schema.ts" }, { id: "read-2" })],
          2
        ),
        assistantMessage(
          [
            thought,
            fauxToolCall("bash", { command: "echo third" }, { id: "shell-3" }),
            fauxToolCall("bash", { command: "echo fourth" }, { id: "shell-4" })
          ],
          3
        ),
        assistantMessage(
          [thought, fauxToolCall("read", { path: "src/last.ts" }, { id: "read-3" })],
          4
        )
      ];
      const calls = messages.flatMap((message) =>
        message.content.filter((block) => block.type === "toolCall")
      );
      const history: unknown[] = [];
      const render = () => tui.chatContainer.render(100).map(stripTerminalSequences).join("\n");

      try {
        tui.hideThinkingBlock = true;
        tui.renderSessionItems([]);

        for (const message of messages) {
          await tui.handleEvent({
            type: "message_start",
            message: { ...message, content: [] }
          });

          for (const [contentIndex, block] of message.content.entries()) {
            // Pi queues references to mutable partials. An earlier event can expose
            // later tool calls before those calls' own events have been consumed.
            const partial = {
              ...message,
              content:
                message === messages[0]
                  ? message.content
                  : message.content.slice(0, contentIndex + 1)
            };
            await tui.handleEvent({
              type: "message_update",
              message: partial,
              assistantMessageEvent:
                block.type === "toolCall"
                  ? { type: "toolcall_end", contentIndex, toolCall: block, partial }
                  : { type: "thinking_end", contentIndex, content: thought.thinking, partial }
            });
          }

          await tui.handleEvent({ type: "message_end", message });
          history.push(message);

          for (const call of message.content.filter((block) => block.type === "toolCall")) {
            const result = {
              role: "toolResult" as const,
              toolCallId: call.id,
              toolName: call.name,
              content: [{ type: "text" as const, text: `retained ${call.id}` }],
              isError: false,
              timestamp: message.timestamp
            };
            await tui.handleEvent({
              type: "tool_execution_end",
              toolCallId: call.id,
              toolName: call.name,
              result,
              isError: false
            });
            history.push(result);
          }
        }

        const live = render();
        expect(live).toContain("├ Read types.ts\n  └ Read tool-schema.ts");
        expect(live).toContain("Ran echo third");
        expect(live).toContain("Ran echo fourth");
        expect(live).toContain("Read src/last.ts");

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionItems(history);
            expect(render()).toBe(live);
          }

          const rows = tui.chatContainer.children.filter(
            (child) => child instanceof ToolExecutionComponent
          );
          expect(rows).toHaveLength(calls.length);

          for (const [index, call] of calls.entries()) {
            const row = rows[index]!;
            row.setExpanded(true);
            expect(text(row)).toContain(`retained ${call.id}`);
            for (const other of calls)
              if (other !== call) expect(text(row)).not.toContain(`retained ${other.id}`);
            row.setExpanded(false);
          }

          tui.hideThinkingBlock = false;
          tui.updateThinkingBlockVisibility();
          expect(render()).toContain(thought.thinking);
          expect(render()).not.toContain("Explored");
          tui.hideThinkingBlock = true;
          tui.updateThinkingBlockVisibility();
          expect(render()).toBe(live);
        }
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it.each(["auto", "generic"])(
  "retains host cancellation across %s live rows and replay without executing tools",
  async (renderer) => {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);
        const signal = vi.spyOn(session.agent, "signal", "get");

        try {
          tui.renderSessionItems([]);
          await session.bindExtensions({ mode: "tui" });
          const calls = ["cancelled", "failed", "successful", "lookalike"].map((id) =>
            fauxToolCall("read", { path: `${id}.txt` }, { id })
          );
          const assistant = assistantMessage(calls);
          session.sessionManager.appendMessage(assistant);
          await tui.handleEvent({ type: "message_start", message: assistant });
          for (const [contentIndex, toolCall] of calls.entries())
            await tui.handleEvent({
              type: "message_update",
              message: assistant,
              assistantMessageEvent: {
                type: "toolcall_end",
                contentIndex,
                toolCall,
                partial: assistant
              }
            });
          await tui.handleEvent({ type: "message_end", message: assistant });
          const cancelledText = "Operation aborted";
          const diagnostics = new Map([
            ["failed", "Access denied"],
            ["successful", "retained text"]
          ]);

          // Result order differs from source order: failures finish before the abort.
          for (const call of [calls[1]!, calls[3]!, calls[0]!, calls[2]!]) {
            signal.mockReturnValue(
              call.id === "cancelled" || call.id === "successful" ? AbortSignal.abort() : undefined
            );
            const message = {
              role: "toolResult" as const,
              toolCallId: call.id,
              toolName: "read",
              content: [
                {
                  type: "text" as const,
                  text: diagnostics.get(call.id) ?? cancelledText
                }
              ],
              isError: call.id !== "successful",
              timestamp: 2
            };
            await tui.handleEvent({
              type: "tool_execution_end",
              toolCallId: call.id,
              toolName: "read",
              result: message,
              isError: message.isError
            });
            await tui.handleEvent({ type: "message_start", message });
            await tui.handleEvent({ type: "message_end", message });
            session.sessionManager.appendMessage(message);
          }

          signal.mockReturnValue(undefined);

          for (const replay of [false, true]) {
            if (replay) {
              tui.chatContainer.clear();
              tui.renderSessionEntries(session.sessionManager.buildContextEntries());
            }

            const rows = tui.chatContainer.children.filter(
              (child) => child instanceof ToolExecutionComponent
            );
            expect(rows).toHaveLength(4);

            if (renderer === "auto") {
              expect(text(rows[0]!)).toContain("1 cancelled");
              expect(text(rows[0]!)).toContain("2 failed");
            }

            rows.forEach((row) => row.setExpanded(true));
            expect(text(rows[0]!)).toContain(
              renderer === "auto" ? "Read cancelled" : "Call cancelled"
            );
            expect(text(rows[0]!)).toContain(cancelledText);
            expect(text(rows[1]!)).toContain(renderer === "auto" ? "Read failed" : "Call failed");
            expect(text(rows[1]!)).toContain("Access denied");
            expect(text(rows[2]!)).not.toContain("cancelled");
            expect(text(rows[2]!)).not.toContain("failed");
            expect(text(rows[3]!)).toContain(renderer === "auto" ? "Read failed" : "Call failed");
          }

          // Pi's result has no cancellation flag; the other outcomes follow from isError.
          expect(saved(session, CALL_TYPE)).toEqual([
            { entry: expect.any(String) as unknown, toolCallId: "cancelled", cancelled: true }
          ]);
        } finally {
          signal.mockRestore();
          tui.footerDataProvider.dispose();
        }
      },
      { rendererOverrides: { read: renderer } }
    );
  }
);

it.each([
  { name: "read", isError: false },
  { name: "write", isError: true }
])(
  "uses finalized $name result outcome $isError in live and replayed rows",
  async ({ name, isError }) => {
    useStepPatchDeadline();
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        await session.bindExtensions({ mode: "tui" });
        const directory = session.sessionManager.getCwd();
        await writeFile(join(directory, "final-result.txt"), "BEFORE\n");
        const args = {
          path: "final-result.txt",
          ...(name === "write" ? { content: "AFTER\n" } : {})
        };
        const call = fauxToolCall(name, args, { id: "final-result" });
        const assistant = assistantMessage([call]);
        session.sessionManager.appendMessage(assistant);
        await tui.handleEvent({ type: "message_start", message: assistant });
        await tui.handleEvent({
          type: "message_update",
          message: assistant,
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: call,
            partial: assistant
          }
        });
        await tui.handleEvent({ type: "message_end", message: assistant });
        const tool = session.agent.state.tools.find((tool) => tool.name === name)!;
        const result = await tool.execute(call.id, args);
        await tui.handleEvent({
          type: "tool_execution_end",
          toolCallId: call.id,
          toolName: name,
          result: { ...result, content: [{ type: "text", text: "Superseded result" }] },
          isError: !isError
        });
        const message = {
          role: "toolResult" as const,
          toolCallId: call.id,
          toolName: name,
          content: [{ type: "text" as const, text: "Final middleware result" }],
          isError,
          timestamp: 2
        };
        // Pi's message_end replacement is authoritative after tool_execution_end.
        await tui.handleEvent({ type: "message_start", message });
        await tui.handleEvent({ type: "message_end", message });
        session.sessionManager.appendMessage(message);
        const original = structuredClone(message);
        const renderings: string[] = [];

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionEntries(session.sessionManager.buildContextEntries());
            // Replay applies this writer's local timing after its in-memory read resolves.
            await new Promise((resolve) => setImmediate(resolve));
          }

          const row = tui.chatContainer.children.find(
            (child) => child instanceof ToolExecutionComponent
          )!;

          for (const expanded of [false, true]) {
            row.setExpanded(expanded);
            const rendered = text(row);
            expect(rendered).not.toContain("Superseded result");
            expect(rendered.includes("Final middleware result")).toBe(
              isError || (name === "read" && expanded)
            );
            expect(rendered.includes("Tool result reports failure after application.")).toBe(
              name === "write" && isError
            );

            if (name === "write") {
              expect(rendered).toContain("-BEFORE");
              expect(rendered).toContain("+AFTER");
            }

            renderings.push(rendered);
          }
        }

        expect(renderings.slice(0, 2)).toEqual(renderings.slice(2));
        expect(message).toEqual(original);
        expect(await readFile(join(directory, "final-result.txt"), "utf8")).toBe(
          name === "write" ? "AFTER\n" : "BEFORE\n"
        );
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it.each([
  { renderer: "auto", finalization: "in a new object" },
  { renderer: "generic", finalization: "in a new object" },
  { renderer: "auto", finalization: "modified in place" },
  { renderer: "auto", finalization: "renamed to write" }
])(
  "uses finalized calls $finalization in $renderer live summaries, expanded parameters, and saved facts",
  async ({ renderer, finalization }) => {
    const inPlace = finalization === "modified in place";
    const renamed = finalization === "renamed to write";

    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          tui.renderSessionItems([]);
          const directory = session.sessionManager.getCwd();
          await writeFile(join(directory, "before.ts"), "BEFORE_TARGET");
          if (!renamed) await writeFile(join(directory, "after.ts"), "AFTER_TARGET");
          const streamedCall = fauxToolCall("read", { path: "before.ts" }, { id: "final-args" });
          const streamed = assistantMessage([streamedCall]);
          await tui.handleEvent({ type: "message_start", message: streamed });
          await tui.handleEvent({
            type: "message_update",
            message: streamed,
            assistantMessageEvent: {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: streamedCall,
              partial: streamed
            }
          });
          // message_end handlers can return a new argument object, modify Pi's object in place,
          // or replace the tool, which Pi then executes in the same row.
          const call = inPlace
            ? streamedCall
            : fauxToolCall(
                renamed ? "write" : "read",
                { path: "after.ts", ...(renamed ? { content: "AFTER_TARGET" } : {}) },
                { id: streamedCall.id }
              );
          if (inPlace) streamedCall.arguments.path = "after.ts";
          const finalized = inPlace ? streamed : assistantMessage([call]);
          session.sessionManager.appendMessage(finalized);
          await tui.handleEvent({ type: "message_end", message: finalized });
          await tui.handleEvent({
            type: "tool_execution_start",
            toolCallId: call.id,
            toolName: call.name,
            args: call.arguments
          });
          const tool = session.agent.state.tools.find((tool) => tool.name === call.name)!;
          const result = await tool.execute(call.id, call.arguments);
          if (renamed)
            expect(await readFile(join(directory, "after.ts"), "utf8")).toBe("AFTER_TARGET");
          else expect(result.content).toEqual([{ type: "text", text: "AFTER_TARGET" }]);
          await tui.handleEvent({
            type: "tool_execution_end",
            toolCallId: call.id,
            toolName: call.name,
            result,
            isError: false
          });
          session.sessionManager.appendMessage({
            role: "toolResult",
            toolCallId: call.id,
            toolName: call.name,
            ...result,
            isError: false,
            timestamp: 2
          });
          const renderings: string[] = [];

          for (const replay of [false, true]) {
            if (replay) {
              tui.chatContainer.clear();
              tui.renderSessionEntries(session.sessionManager.buildContextEntries());
              // Replay applies a writer's local timing after its in-memory read resolves.
              await new Promise((resolve) => setImmediate(resolve));
            }

            const row = tui.chatContainer.children.find(
              (child) => child instanceof ToolExecutionComponent
            )!;

            for (const expanded of [false, true]) {
              row.setExpanded(expanded);
              const rendered = text(row);
              expect(rendered).toContain("after.ts");
              expect(rendered).not.toContain("before.ts");
              // Only the write adapter shows the observed creation diff.
              expect(rendered.includes("+AFTER_TARGET")).toBe(renamed);

              if (expanded) {
                expect(rendered).toContain('"path"');
                expect(rendered).toContain("AFTER_TARGET");
              }

              renderings.push(rendered);
            }
          }

          expect(renderings.slice(0, 2)).toEqual(renderings.slice(2));
          expect(saved(session, CALL_TYPE)).toEqual(
            renamed
              ? [
                  {
                    entry: expect.any(String) as unknown,
                    toolCallId: call.id,
                    applied: true,
                    change: { kind: "creation" }
                  }
                ]
              : []
          );
          expect(streamedCall.arguments.path).toBe(inPlace ? "after.ts" : "before.ts");
          expect(call.arguments.path).toBe("after.ts");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { showParameters: true, rendererOverrides: { read: renderer } }
    );
  }
);

it.each(["rpc", "print", "json"] as const)(
  "collects native facts in %s without TUI hooks through reload",
  async (mode) => {
    const original = host.getRegisteredToolDefinition;
    await withSession(async ({ session, assertNoRegistration }) => {
      await session.bindExtensions({ mode, onError: () => {} });
      const assertPreserved = preserveRegistry(session);
      expect(host.getRegisteredToolDefinition).toBe(original);
      const faux = fauxProvider({ provider: "display-headless", models: [{ id: "offline" }] });
      session.modelRuntime.registerNativeProvider(faux.provider);
      await session.modelRuntime.refresh({ allowNetwork: false });
      await session.setModel(faux.getModel());
      // A nonzero exit code is saved only for an observed call.
      faux.setResponses([
        fauxAssistantMessage([
          fauxToolCall(
            "bash",
            { command: 'printf "%s" "$TOOL_DISPLAY_TEST"; exit 3' },
            { id: "headless-shell" }
          )
        ]),
        fauxAssistantMessage("done")
      ]);
      await session.prompt("Run the native command");
      const entries = session.sessionManager.getEntries();
      const facts = [
        { entry: expect.any(String) as unknown, toolCallId: "headless-shell", exitCode: 3 }
      ];
      expect(saved(session, CALL_TYPE)).toEqual(facts);
      expect(
        entries.find((entry) => entry.type === "message" && entry.message.role === "toolResult")
      ).toMatchObject({
        message: {
          content: [{ type: "text", text: "preserved\n\nCommand exited with code 3" }],
          isError: true
        }
      });
      assertPreserved();
      const invalid = {
        ...session.settingsManager.getGlobalSettings(),
        "ext.pi-tool-display": { showParameters: "invalid" }
      };
      vi.spyOn(session.settingsManager, "getGlobalSettings").mockReturnValue(invalid);
      await session.reload();
      expect(host.getRegisteredToolDefinition).toBe(original);
      assertNoRegistration();
      faux.setResponses([
        fauxAssistantMessage([
          fauxToolCall("bash", { command: "printf disabled; exit 3" }, { id: "disabled-shell" })
        ]),
        fauxAssistantMessage("done")
      ]);
      await session.prompt("Run after disabling display observation");
      expect(saved(session, CALL_TYPE)).toEqual(facts);
    });
  }
);

it("replays session facts and local timing after a fork and reload, and reports local details missing on this machine", async () => {
  await withSession(
    async ({ session, agentDir }) => {
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        await session.bindExtensions({ mode: "tui" });
        const faux = fauxProvider({ provider: "display-replay", models: [{ id: "offline" }] });
        session.modelRuntime.registerNativeProvider(faux.provider);
        await session.modelRuntime.refresh({ allowNetwork: false });
        await session.setModel(faux.getModel());
        faux.setResponses([
          fauxAssistantMessage([
            fauxToolCall("bash", { command: "printf kept; exit 3" }, { id: "kept" })
          ]),
          fauxAssistantMessage("done")
        ]);
        await session.prompt("Run the native command");
        const manager = session.sessionManager;
        const source = manager
          .getEntries()
          .find(
            (entry) =>
              entry.type === "message" &&
              entry.message.role === "assistant" &&
              entry.message.content.some((part) => part.type === "toolCall" && part.id === "kept")
          );
        if (!source) throw new Error("Expected the shell's assistant entry");
        const selected = manager.getLeafId()!;
        const excluded = manager.appendCustomEntry(CALL_TYPE, {
          entry: source.id,
          toolCallId: "kept",
          exitCode: 91
        });
        manager.branch(selected);
        manager.appendCustomEntry(CALL_TYPE, {
          entry: selected,
          toolCallId: "kept",
          exitCode: 92
        });
        manager.appendCustomEntry(CALL_TYPE, {
          entry: source.id,
          toolCallId: "another-call",
          exitCode: 93
        });
        expect(manager.getEntry(excluded)).toBeDefined();
        expect(manager.getBranch().some((entry) => entry.id === excluded)).toBe(false);

        const replayed = async () => {
          await session.reload();
          tui.chatContainer.clear();
          tui.renderSessionEntries(manager.buildContextEntries());
          const row = tui.chatContainer.children.find(
            (child) => child instanceof ToolExecutionComponent
          );
          if (!row) throw new Error("Expected the replayed shell row");
          row.setExpanded(true);

          return row;
        };

        const matching = await replayed();
        await vi.waitFor(() => expect(text(matching)).toMatch(/Exit 3 · \d+ms/), {
          timeout: STEP_TIMEOUT_MS
        });
        const file = manager.getSessionFile();
        // Like /fork and /clone: a new session file with the same selected entry IDs.
        manager.createBranchedSession(manager.getLeafId()!);
        expect(manager.getSessionFile()).not.toBe(file);
        const forked = await replayed();
        await vi.waitFor(() => expect(text(forked)).toMatch(/Exit 3 · \d+ms/), {
          timeout: STEP_TIMEOUT_MS
        });
        expect(text(forked)).not.toContain("Local details");
        await rm(join(agentDir, "pi-tool-display"), { recursive: true });
        const moved = await replayed();
        await vi.waitFor(
          () =>
            expect(text(moved)).toContain(
              "Local details for this part of the session are not on this machine."
            ),
          { timeout: STEP_TIMEOUT_MS }
        );
        expect(text(moved)).toContain("Exit 3 · Timing not on this machine");
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    undefined,
    undefined,
    [],
    true
  );
});

it("leaves external owner rendering untouched, including built-in names and inherited slots", () => {
  const original = host.getRegisteredToolDefinition;
  const dispose = installHostIntegration();

  try {
    for (const name of ["read", "external_tool"]) {
      for (const [source, inherited] of [
        ["remote-extension", false],
        ["sdk", true]
      ] as const) {
        for (const renderers of [
          { renderCall: () => new Text("owner call") },
          { renderResult: () => new Text("owner result") }
        ]) {
          const definition = defineTool({ ...createReadToolDefinition("/tmp"), name });
          delete definition.renderCall;
          delete definition.renderResult;
          if (inherited) Object.setPrototypeOf(definition, renderers);
          else Object.assign(definition, renderers);
          Object.freeze(definition);
          const session = { ...lookupSession(name, source), getToolDefinition: () => definition };
          const previous = original.call({ session }, name);
          expect(host.getRegisteredToolDefinition.call({ session }, name)).toEqual(previous);
        }
      }
    }

    // A tool without an owner must be decorated, proving lookup is not simply failing open.
    const session = { ...lookupSession("unknown_builtin"), getToolDefinition: () => undefined };
    expect(host.getRegisteredToolDefinition.call({ session }, "unknown_builtin")?.renderShell).toBe(
      "self"
    );
  } finally {
    dispose?.();
  }
});

it("leaves resolver renderers of registered tools untouched and keeps unregistered calls upgradable", () => {
  const original = host.getRegisteredToolDefinition;
  const dispose = installHostIntegration();
  const name = "mcp__fixture__search";
  const { renderCall: _call, renderResult: _result, ...plain } = createReadToolDefinition("/tmp");
  const definition = defineTool({ ...plain, name });
  // Like Pi's MCP fallback, the resolver also answers names that are not registered (yet).
  const resolved = { renderCall: () => new Text("resolver call") };

  const session = (registered: boolean, rendererOverrides = {}): LookupSession => {
    const settings: Record<string, unknown> = { "ext.pi-tool-display": { rendererOverrides } };

    return {
      ...lookupSession(name, "extension"),
      settingsManager: SettingsManager.inMemory(settings),
      getToolDefinition: () => (registered ? definition : undefined),
      extensionRunner: {
        resolveToolRenderers: (toolName, base) => (toolName === name ? resolved : base())
      }
    };
  };

  const shell = (target: LookupSession) =>
    host.getRegisteredToolDefinition.call({ session: target }, name)?.renderShell;

  try {
    const owned = session(true);
    expect(host.getRegisteredToolDefinition.call({ session: owned }, name)).toBe(
      original.call({ session: owned }, name)
    );
    // MCP tools register after reload reconstructs rows. Pi's rows could not be upgraded.
    expect(shell(session(false))).toBe("self");
    expect(shell(session(true, { [name]: "generic" }))).toBe("self");
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
        const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
        const uiContext = { notify } satisfies Pick<ExtensionContext["ui"], "notify">;
        await session.bindExtensions({
          mode: "tui",
          // This binding only reports the unavailable lookup; no dialogs or editor are used.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          uiContext: uiContext as unknown as ExtensionContext["ui"]
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

it("keeps rows native and disposal complete when one row's hooks fail to install or release", async () => {
  await withSession(async ({ session }) => {
    const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
    const uiContext = { notify } satisfies Pick<ExtensionContext["ui"], "notify">;
    await session.bindExtensions({
      mode: "tui",
      // This binding only reports warnings; no dialogs or editor are used.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      uiContext: uiContext as unknown as ExtensionContext["ui"]
    });
    const tui = interactiveHost(session);
    const addChild = tui.chatContainer.addChild.bind(tui.chatContainer);
    const locked: object[] = [];
    const lockedKeys = new Map<unknown, string>([
      [ToolExecutionComponent, "handleMouse"],
      [AssistantMessageComponent, "updateContent"]
    ]);

    // Another owner locks one instance property of the first assistant and tool rows.
    // Pi's prototype contracts still match, so only those rows fail to bind.
    tui.chatContainer.addChild = (child) => {
      const key = lockedKeys.get(child.constructor);

      if (key && !locked.some((row) => row.constructor === child.constructor)) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(child), key);
        Object.defineProperty(child, key, { ...descriptor, writable: false });
        locked.push(child);
      }

      addChild(child);
    };

    try {
      const message = assistantMessage([
        { type: "text", text: "Locked prose" },
        fauxToolCall("read", { path: "a.ts" }, { id: "locked" }),
        fauxToolCall("read", { path: "b.ts" }, { id: "bound" })
      ]);
      tui.renderSessionItems([
        message,
        ...["locked", "bound"].map((toolCallId) => ({
          role: "toolResult",
          toolCallId,
          toolName: "read",
          content: [{ type: "text", text: "retained body" }],
          isError: false,
          timestamp: 2
        })),
        { ...assistantMessage([{ type: "text", text: "Bound prose" }], 3), stopReason: "stop" }
      ]);
      await tui.handleEvent({
        type: "message_start",
        message: assistantMessage([{ type: "text", text: "Live prose" }], 4)
      });
      const assistants = tui.chatContainer.children.filter(
        (child) => child instanceof AssistantMessageComponent
      );
      const rows = tui.chatContainer.children.filter(
        (child) => child instanceof ToolExecutionComponent
      );
      const rendered = (row: AssistantMessageComponent) =>
        row.render(80).map(stripTerminalSequences).join("\n");
      expect(assistants).toHaveLength(3);
      expect(rows).toHaveLength(2);
      expect(locked).toEqual([assistants[0], rows[0]]);
      expect(notify.mock.calls.filter(([text]) => text.includes("row hooks"))).toEqual([
        ["pi-tool-display: row hooks unavailable; affected rows keep Pi's presentation.", "warning"]
      ]);

      // The failed tool row keeps no partial hooks; its sibling still binds.
      for (const key of ["invalidate", "render", "setExpanded"])
        expect([Object.hasOwn(rows[0]!, key), Object.hasOwn(rows[1]!, key)]).toEqual([false, true]);
      expect(rendered(assistants[0]!)).not.toContain("•");
      expect(rendered(assistants[1]!)).toContain("• Bound prose");
      expect(rendered(assistants[2]!)).toContain("• Live prose");

      // A later owner's callback fails while the first bound row is released.
      assistants[1]!.invalidate = () => {
        throw new Error("later owner invalidate failure");
      };

      const dispose = interactivePrototype()[hostHook];
      expect(dispose).toBeTypeOf("function");
      expect(() => dispose?.()).not.toThrow();
      expect(interactivePrototype()[hostHook]).toBeUndefined();
      expect(notify).toHaveBeenCalledWith(
        "pi-tool-display: row cleanup failed; affected rows may show display styling until Pi redraws them.",
        "warning"
      );
      expect(Object.hasOwn(rows[1]!, "render")).toBe(false);
      assistants[2]!.invalidate();
      expect(rendered(assistants[2]!)).toContain("Live prose");
      expect(rendered(assistants[2]!)).not.toContain("•");
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it("replaces repeated installations and preserves later wrappers during repeated disposal and reinstallation", () => {
  const original = host.getRegisteredToolDefinition;
  const firstDispose = installHostIntegration();
  const secondDispose = installHostIntegration();
  let thirdDispose: (() => void) | undefined;

  try {
    firstDispose?.();
    const installed = host.getRegisteredToolDefinition;
    const session = {
      ...lookupSession(),
      getToolDefinition: () => undefined
    };
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).toBe("self");

    const laterWrapper: typeof installed = function (name) {
      return installed.call(this, name);
    };

    host.getRegisteredToolDefinition = laterWrapper;
    secondDispose?.();
    secondDispose?.();
    expect(host.getRegisteredToolDefinition).toBe(laterWrapper);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).not.toBe(
      "self"
    );

    thirdDispose = installHostIntegration();
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

function summaryHistory(session: AgentSession) {
  const message = assistantMessage([
    fauxToolCall("read", { path: "a.ts" }, { id: "mode-r1" }),
    fauxToolCall("read", { path: "b.ts" }, { id: "mode-r2" }),
    fauxToolCall("bash", { command: "npm test" }, { id: "mode-b1" })
  ]);
  const results = [
    ["mode-r1", "read", "retained a"],
    ["mode-r2", "read", "retained b"],
    ["mode-b1", "bash", "npm ERR! missing script"]
  ].map(([toolCallId, toolName, text]) => ({
    role: "toolResult" as const,
    toolCallId: toolCallId!,
    toolName: toolName!,
    content: [{ type: "text" as const, text: text! }],
    isError: toolName === "bash",
    timestamp: 2
  }));
  session.sessionManager.appendMessage(message);
  results.forEach((result) => session.sessionManager.appendMessage(result));

  return [message, ...results];
}

function transcriptText(tui: ReturnType<typeof interactiveHost>): string {
  return tui.chatContainer.render(100).map(stripTerminalSequences).join("\n");
}

it("executes nested codemode calls once without persisting child facts", async () => {
  await withSession(
    async ({ session }) => {
      expect(session.getAllTools().find((tool) => tool.name === "codemode")?.sourceInfo.path).toBe(
        "builtin:codemode"
      );
      const view = host.getRegisteredToolDefinition.call({ session }, "codemode");
      expect(view?.renderShell).toBe("self");
      session.setActiveToolsByName([...session.getActiveToolNames(), "codemode"]);
      const faux = fauxProvider({ provider: "display-nested", models: [{ id: "offline" }] });
      session.modelRuntime.registerNativeProvider(faux.provider);
      await session.modelRuntime.refresh({ allowNetwork: false });
      await session.setModel(faux.getModel());
      await writeFile(join(session.sessionManager.getCwd(), "nested.txt"), "original\n");
      faux.setResponses([
        fauxAssistantMessage([
          fauxToolCall(
            "codemode",
            {
              code: 'await tools.read({path:"nested.txt"}); await tools.edit({path:"nested.txt", edits:[{oldText:"original",newText:"changed"}]}); await tools.write({path:"created.txt",content:"created"}); const result = await tools.bash({command:"printf nested-output"}); text(result.output);'
            },
            { id: "parent" }
          )
        ]),
        fauxAssistantMessage("done")
      ]);
      const tui = interactiveHost(session);
      let pending = Promise.resolve();
      const events: AgentSessionEvent[] = [];
      const unsubscribe = session.subscribe((event) => {
        events.push(event);
        if (
          [
            "message_start",
            "message_update",
            "message_end",
            "tool_execution_start",
            "tool_execution_update",
            "tool_execution_end",
            "agent_end"
          ].includes(event.type)
        )
          pending = pending.then(() => tui.handleEvent(event));
      });

      try {
        await session.bindExtensions({ mode: "tui" });
        tui.renderSessionItems([]);
        await session.prompt("Run nested tools");
        await pending;
        const children = events.filter(
          (event) => event.type === "tool_execution_end" && event.parentToolCallId === "parent"
        );
        expect(children).toHaveLength(4);
        expect(
          children.every((event) => event.type === "tool_execution_end" && !event.isError)
        ).toBe(true);
        expect(await readFile(join(session.sessionManager.getCwd(), "nested.txt"), "utf8")).toBe(
          "changed\n"
        );
        const branch = session.sessionManager.getBranch();
        expect(
          branch.filter((entry) => entry.type === "message" && entry.message.role === "toolResult")
        ).toHaveLength(1);
        expect(saved(session, CALL_TYPE)).toEqual([]);
      } finally {
        unsubscribe();
        tui.footerDataProvider.dispose();
      }
    },
    { collapsedMode: "summary" },
    undefined,
    [
      {
        name: "codemode",
        factory: createCodemodeExtension({ mode: "on" }),
        builtin: true,
        replaceable: true
      }
    ]
  );
});

it("keeps summary rendering and toggles verbose when Pi's expansion methods differ", async () => {
  const prototype = interactivePrototype();
  const originalToggle = prototype.toggleToolOutputExpansion;

  // A different method body disables mode hooks; Pi's own toggle keeps working.
  prototype.toggleToolOutputExpansion = function (this: Host) {
    originalToggle?.call(this);
  };

  try {
    await withSession(
      async ({ session }) => {
        const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
        const uiContext = { notify } satisfies Pick<ExtensionContext["ui"], "notify">;
        await session.bindExtensions({
          mode: "tui",
          // This binding only reports warnings; no dialogs or editor are used.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          uiContext: uiContext as unknown as ExtensionContext["ui"]
        });
        const tui = interactiveHost(session);

        try {
          tui.renderSessionItems(summaryHistory(session));
          expect(notify).toHaveBeenCalledWith(
            "pi-tool-display: mode cycling unavailable; Ctrl+O toggles summary ↔ verbose.",
            "warning"
          );
          expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
          tui.toggleToolOutputExpansion?.();
          expect(transcriptText(tui)).toContain("retained a");
          expect(transcriptText(tui)).toContain("Tool output: expanded");
          tui.toggleToolOutputExpansion?.();
          expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
          expect(transcriptText(tui)).not.toContain("retained a");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode: "summary" }
    );
  } finally {
    Reflect.set(prototype, "toggleToolOutputExpansion", originalToggle);
  }
});

it("keeps Pi's row chrome and disables summaries when Pi's row contract differs", async () => {
  const row = ToolExecutionComponent.prototype;
  // oxlint-disable-next-line typescript/unbound-method
  const handleMouse = row.handleMouse;

  // A different method body disables row chrome; groups keep Pi's margin rows.
  row.handleMouse = function (this: ToolExecutionComponent, event) {
    return handleMouse.call(this, event);
  };

  try {
    await withSession(
      async ({ session }) => {
        const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
        const uiContext = { notify } satisfies Pick<ExtensionContext["ui"], "notify">;
        await session.bindExtensions({
          mode: "tui",
          // This binding only reports warnings; no dialogs or editor are used.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          uiContext: uiContext as unknown as ExtensionContext["ui"]
        });
        const tui = interactiveHost(session);

        try {
          tui.renderSessionItems(summaryHistory(session));
          expect(notify).toHaveBeenCalledWith(
            "pi-tool-display: row contract unavailable; summaries disabled.",
            "warning"
          );
          expect(transcriptText(tui)).not.toContain("Read 2 files");
          expect(transcriptText(tui)).toContain("Explored");
          expect(transcriptText(tui)).toContain("Run failed");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode: "summary" }
    );
  } finally {
    Reflect.set(row, "handleMouse", handleMouse);
  }
});

it("restores expansion methods on disposal and preserves later wrappers", () => {
  const prototype = interactivePrototype();
  const toggle = prototype.toggleToolOutputExpansion;
  const setExpanded = prototype.setToolsExpanded;
  const dispose = installHostIntegration();

  try {
    expect(prototype.toggleToolOutputExpansion).not.toBe(toggle);
    const hooked = prototype.setToolsExpanded;

    const later = function (this: Host, expanded: boolean) {
      hooked?.call(this, expanded);
    };

    prototype.setToolsExpanded = later;
    dispose?.();
    expect(prototype.toggleToolOutputExpansion).toBe(toggle);
    expect(prototype.setToolsExpanded).toBe(later);
  } finally {
    dispose?.();
    Reflect.set(prototype, "setToolsExpanded", setExpanded);
  }
});
