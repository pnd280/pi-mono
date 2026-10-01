import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type AssistantMessageEvent
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  createReadToolDefinition,
  createSyntheticSourceInfo,
  CustomMessageComponent,
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
import {
  type Container,
  getCapabilities,
  setCapabilityOverrides,
  stripTerminalSequences,
  Text,
  type TUI
} from "@earendil-works/pi-tui";
import { observeFileMutations } from "@pi-mono/libs/file-mutations";
import nestedInstructions from "pi-nested-instructions";
import { noticeEntry, noticeType } from "pi-nested-instructions/notices";
import { expect, it, vi } from "vite-plus/test";

import toolDisplay from "../index.ts";
import { assistantMessage, messageToolCall, renderingTui } from "../test-fixture.ts";
import { METADATA_TYPE } from "../transcript/metadata.ts";
import { hostHook, interactivePrototype, type Host } from "./compatibility.ts";
import { displaySettings } from "./configuration.ts";
import { installHostIntegration } from "./install.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

type LookupSession = Pick<AgentSession, "getAllTools" | "settingsManager" | "sessionManager"> & {
  getToolDefinition: (name: string) => RenderDefinition;
};

// Pi 0.99.2's lookup is private; exercise its actual implementation without starting a terminal.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const host = InteractiveMode.prototype as unknown as {
  getRegisteredToolDefinition: (this: { session: LookupSession }, name: string) => RenderDefinition;
};

function lookupSession(name = "read", source = "builtin"): LookupSession {
  const definition = { ...createReadToolDefinition("/tmp"), name };

  return {
    settingsManager: SettingsManager.inMemory(),
    sessionManager: SessionManager.inMemory("/tmp"),
    getToolDefinition: () => definition,
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
  // Exercise Pi 0.99.2's private reconstruction/event paths without terminal startup.
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
  }) => Promise<void>,
  displayConfiguration?: unknown,
  baseToolsOverride?: ConstructorParameters<typeof AgentSession>[0]["baseToolsOverride"],
  builtinExtensions: readonly InlineExtension[] = []
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
      shellPath: "/bin/bash",
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
      sessionManager: SessionManager.inMemory(directory)
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

it("owns nested-instruction notice rendering through replay, reload, and display removal", async () => {
  await withSession(async ({ session, extensionFactories }) => {
    await session.bindExtensions({ mode: "tui" });
    const cwd = session.sessionManager.getCwd();
    const directory = join(cwd, "pkg");
    const file = join(directory, "AGENTS.md");
    await mkdir(directory);
    await writeFile(file, "Retained instructions");
    const entry = noticeEntry(
      directory,
      { path: file, stamp: "fixture", content: "Retained instructions" },
      "loaded",
      cwd
    );
    session.sessionManager.appendCustomMessageEntry(
      entry.customType,
      entry.content,
      entry.display,
      entry.details
    );

    const row = () => {
      const saved = session.sessionManager
        .getBranch()
        .find((item) => item.type === "custom_message" && item.customType === noticeType);
      if (!saved || saved.type !== "custom_message") throw new Error("Expected saved notice");
      expect(saved.content).toEqual(entry.content);
      expect(saved.details).toEqual(entry.details);

      return new CustomMessageComponent(
        { ...saved, role: "custom", timestamp: 0 },
        session.extensionRunner.getMessageRenderer(noticeType)
      );
    };

    const contents = (component: CustomMessageComponent) =>
      component.render(80).map(stripTerminalSequences).join("\n");
    const compact = row();
    expect(contents(compact)).toContain("• Loaded pkg/AGENTS.md");
    expect(contents(compact)).not.toContain("Retained instructions");
    compact.setExpanded(true);
    expect(contents(compact)).toContain("Retained instructions");
    expect(contents(compact)).not.toContain("instructions from");

    // Loading discovery before display must not compete for the renderer.
    extensionFactories.unshift(nestedInstructions);
    await session.reload();
    expect(contents(row())).toContain("• Loaded pkg/AGENTS.md");

    extensionFactories.splice(1);
    await session.reload();
    expect(session.extensionRunner.getMessageRenderer(noticeType)).toBeUndefined();
    expect(contents(row())).toContain("Retained instructions");
    expect(contents(row())).not.toContain("• Loaded pkg/AGENTS.md");
  });
});

it("applies parameter visibility to standalone and reconstructed host rows through reload", async () => {
  await withSession(
    async ({ session, assertNoRegistration }) => {
      const standalone = readRow(session);
      standalone.setExpanded(true);
      expect(text(standalone)).toContain('"path"');
      const tui = interactiveHost(session);

      try {
        const message = assistantMessage([
          fauxToolCall("read", { path: "example.txt" }, { id: "parameters" })
        ]);
        const result = {
          role: "toolResult" as const,
          toolCallId: "parameters",
          toolName: "read",
          content: [{ type: "text" as const, text: "retained result" }],
          isError: false,
          timestamp: 2
        };

        const reconstruct = () => {
          tui.chatContainer.clear();
          tui.renderSessionItems([message, result]);
          const row = tui.chatContainer.children.find(
            (child) => child instanceof ToolExecutionComponent
          )!;
          row.setExpanded(true);
          expect(text(row)).toContain('"path"');
          expect(text(row)).toContain("retained result");
          row.setExpanded(false);
          expect(text(row)).not.toContain('"path"');
        };

        reconstruct();
        await session.bindExtensions({
          mode: "tui",
          onError: (error) => {
            throw new Error(error.error);
          }
        });
        await session.reload({ beforeSessionStart: reconstruct });
        assertNoRegistration();
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { showParameters: true }
  );
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

it("binds real transcript rows, group clicks and observed native calls before Pi middleware wrapping", async () => {
  await withSession(async ({ session, assertNoRegistration }) => {
    const tui = interactiveHost(session);

    try {
      const message = assistantMessage([
        fauxToolCall("read", { path: "a.ts" }, { id: "r1" }),
        fauxToolCall("read", { path: "b.ts" }, { id: "r2" }),
        fauxToolCall("read", { path: "a.ts" }, { id: "r3" })
      ]);
      session.sessionManager.appendMessage(message);
      const results = ["r1", "r2", "r3"].map((toolCallId) => ({
        role: "toolResult" as const,
        toolCallId,
        toolName: "read",
        content: [{ type: "text" as const, text: `retained ${toolCallId}` }],
        isError: false,
        timestamp: 2
      }));
      results.forEach((result) => session.sessionManager.appendMessage(result));
      tui.renderSessionItems([message, ...results]);
      const rows = tui.chatContainer.children.filter(
        (child) => child instanceof ToolExecutionComponent
      );
      expect(rows).toHaveLength(3);
      expect(text(rows[0]!)).toBe("\n• Explored .\n  ├ Read a.ts");
      expect(text(rows[1]!)).toBe("  ├ Read b.ts");
      expect(text(rows[2]!)).toBe("  └ Read a.ts");
      // The joined sibling's first visible line remains a native group click target.
      rows[1]!.handleMouse({
        type: "click",
        button: "left",
        x: 5,
        y: 0,
        screenX: 5,
        screenY: 2,
        width: 80,
        height: 1,
        shift: false,
        alt: false,
        ctrl: false
      });
      expect(text(rows[1]!)).toContain("retained r2");
      expect(text(rows[1]!)).not.toContain('"path"');
      expect(rows[1]!.render(80)[0]).toBe("");
      rows[2]!.setExpanded(false);
      expect(text(rows[1]!)).toBe("  ├ Read b.ts");
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
      expect(
        session.sessionManager
          .getBranch()
          .filter((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
      ).toHaveLength(1);
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

it("separates new exploration after compaction reconstruction and restores row expansion", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);

    try {
      const message = assistantMessage([
        fauxToolCall("read", { path: "a.ts" }, { id: "retained-read" })
      ]);
      const firstKeptEntryId = session.sessionManager.appendMessage(message);
      const result = {
        role: "toolResult" as const,
        toolCallId: "retained-read",
        toolName: "read",
        content: [{ type: "text" as const, text: "retained after compaction" }],
        isError: false,
        timestamp: 2
      };
      session.sessionManager.appendMessage(result);
      tui.renderSessionItems([message, result]);
      session.sessionManager.appendCompaction("summary", firstKeptEntryId, 100);
      await tui.handleEvent({
        type: "compaction_end",
        reason: "manual",
        aborted: false,
        willRetry: false,
        result: { summary: "summary", firstKeptEntryId, tokensBefore: 100 }
      });
      const row = tui.chatContainer.children.find(
        (child) => child instanceof ToolExecutionComponent
      )!;
      expect(text(row)).not.toContain("retained after compaction");
      const nextMessage = assistantMessage(
        [fauxToolCall("read", { path: "b.ts" }, { id: "after-compaction" })],
        3
      );
      await tui.handleEvent({ type: "message_start", message: nextMessage });
      await tui.handleEvent({
        type: "message_update",
        message: nextMessage,
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall: messageToolCall(nextMessage),
          partial: nextMessage
        }
      });
      await tui.handleEvent({ type: "message_end", message: nextMessage });
      await tui.handleEvent({
        type: "tool_execution_end",
        toolCallId: "after-compaction",
        toolName: "read",
        result: { content: [{ type: "text", text: "new exploration body" }], details: undefined },
        isError: false
      });
      const nextRow = tui.chatContainer.children
        .filter((child) => child instanceof ToolExecutionComponent)
        .at(-1)!;
      expect(text(row)).toContain("• Read a.ts");
      expect(text(nextRow)).toContain("• Read b.ts");
      expect(nextRow.render(80)[0]).toBe("");
      nextRow.setExpanded(true);
      expect(text(nextRow)).toContain("new exploration body");
      expect(text(row)).not.toContain("retained after compaction");
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      row.setExpanded(true);
      expect(text(row)).toContain("retained after compaction");
      // Compare method identity without invoking either unbound reference.
      // oxlint-disable-next-line typescript/unbound-method
      expect(row.setExpanded).toBe(ToolExecutionComponent.prototype.setExpanded);
      // oxlint-disable-next-line typescript/unbound-method
      expect(row.render).toBe(ToolExecutionComponent.prototype.render);
      // oxlint-disable-next-line typescript/unbound-method
      expect(row.handleMouse).toBe(ToolExecutionComponent.prototype.handleMouse);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["visible message", "hidden message", "context edit"])(
  "separates boundary entries only when displayed: %s",
  async (kind) => {
    const display = kind === "visible message";
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);

        for (const [index, id] of ["a", "b"].entries()) {
          const message = assistantMessage(
            [fauxToolCall("read", { path: `${id}.ts` }, { id })],
            index + 1
          );
          session.sessionManager.appendMessage(message);
          await tui.handleEvent({ type: "message_start", message });
          await tui.handleEvent({
            type: "message_update",
            message,
            assistantMessageEvent: {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: messageToolCall(message),
              partial: message
            }
          });
          await tui.handleEvent({ type: "message_end", message });
          const result = {
            role: "toolResult" as const,
            toolCallId: id,
            toolName: "read",
            content: [{ type: "text" as const, text: `body ${id}` }],
            isError: false,
            timestamp: index + 1
          };
          const resultId = session.sessionManager.appendMessage(result);
          await tui.handleEvent({
            type: "tool_execution_end",
            toolCallId: id,
            toolName: "read",
            result,
            isError: false
          });

          if (id === "a") {
            const entryId =
              kind === "context edit"
                ? session.sessionManager.appendContextEdit(resultId, null)
                : session.sessionManager.appendCustomMessageEntry(
                    "boundary-message",
                    "Boundary message",
                    display
                  );
            await tui.handleEvent({
              type: "entry_appended",
              entry: session.sessionManager.getEntry(entryId)!
            });
          }
        }

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionEntries(session.sessionManager.buildContextEntries());
          }

          const rows = tui.chatContainer.children.filter(
            (child) => child instanceof ToolExecutionComponent
          );
          expect(rows).toHaveLength(2);
          expect(text(rows[0]!).includes("Explored")).toBe(!display);
          rows[1]!.setExpanded(true);
          expect(text(rows[0]!).includes("body a")).toBe(!display);
          expect(text(rows[1]!)).toContain("body b");
        }
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it("retains expansion ownership across both slices of boundary compaction replay", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);
    const manager = session.sessionManager;

    const appendRead = (id: string, timestamp: number) => {
      const messageId = manager.appendMessage(
        assistantMessage([fauxToolCall("read", { path: `${id}.ts` }, { id })], timestamp)
      );
      manager.appendMessage({
        role: "toolResult",
        toolCallId: id,
        toolName: "read",
        content: [{ type: "text", text: `body ${id}` }],
        isError: false,
        timestamp
      });

      return messageId;
    };

    try {
      const firstKeptEntryId = appendRead("a", 1);
      appendRead("b", 2);
      tui.renderSessionEntries(manager.buildContextEntries());
      const compactionId = manager.appendCompaction("Boundary summary", firstKeptEntryId, 100);
      appendRead("c", 3);
      appendRead("d", 4);
      await tui.handleEvent({ type: "entry_appended", entry: manager.getEntry(compactionId)! });
      const rows = tui.chatContainer.children.filter(
        (child) => child instanceof ToolExecutionComponent
      );
      expect(rows).toHaveLength(4);
      expect(text(rows[0]!)).toContain("Explored");
      expect(text(rows[2]!)).toContain("Explored");
      rows[1]!.setExpanded(true);
      expect(text(rows[0]!)).toContain("body a");
      expect(text(rows[1]!)).toContain("body b");
      expect(text(rows[2]!)).not.toContain("body c");
      rows[3]!.setExpanded(true);
      expect(text(rows[2]!)).toContain("body c");
      expect(text(rows[3]!)).toContain("body d");
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["failure", "cancelled", "silent"])(
  "separates exploration only when unsuccessful compaction is visible: %s",
  async (outcome) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        const first = assistantMessage([fauxToolCall("read", { path: "a.ts" }, { id: "a" })]);
        const firstResult = {
          role: "toolResult" as const,
          toolCallId: "a",
          toolName: "read",
          content: [{ type: "text" as const, text: "body a" }],
          isError: false,
          timestamp: 2
        };
        tui.renderSessionItems([first, firstResult]);
        await tui.handleEvent({
          type: "compaction_end",
          reason: "threshold",
          aborted: outcome === "cancelled",
          result: undefined,
          willRetry: false,
          ...(outcome === "failure" ? { errorMessage: "Compaction failed fixture" } : {})
        });
        const next = assistantMessage([fauxToolCall("read", { path: "b.ts" }, { id: "b" })], 3);
        await tui.handleEvent({ type: "message_start", message: next });
        await tui.handleEvent({
          type: "message_update",
          message: next,
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: messageToolCall(next),
            partial: next
          }
        });
        await tui.handleEvent({ type: "message_end", message: next });
        await tui.handleEvent({
          type: "tool_execution_end",
          toolCallId: "b",
          toolName: "read",
          result: { content: [{ type: "text", text: "body b" }], details: undefined },
          isError: false
        });
        const rows = tui.chatContainer.children.filter(
          (child) => child instanceof ToolExecutionComponent
        );
        const transcript = tui.chatContainer.render(80).map(stripTerminalSequences).join("\n");
        const visible = outcome !== "silent";

        if (visible) {
          const notice =
            outcome === "failure" ? "Compaction failed fixture" : "Auto-compaction cancelled";
          expect(transcript.indexOf(notice)).toBeGreaterThan(transcript.indexOf("Read a.ts"));
          expect(transcript.indexOf(notice)).toBeLessThan(transcript.indexOf("Read b.ts"));
        }

        expect(text(rows[1]!).includes("• Read b.ts")).toBe(visible);
        expect(rows[1]!.render(80)[0] === "").toBe(visible);
        rows[1]!.setExpanded(true);
        expect(text(rows[0]!).includes("body a")).toBe(!visible);
        expect(text(rows[1]!)).toContain("body b");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

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
    const args = { command: 'printf "%s" "$TOOL_DISPLAY_TEST"' };
    session.settingsManager.setShellCommandPrefix("export TOOL_DISPLAY_TEST=changed");
    const expected = await original.execute("original-settings", args);
    expect(expected.content).toEqual([{ type: "text", text: "preserved" }]);
    const tui = interactiveHost(session);

    try {
      tui.renderSessionItems([]);
      await session.bindExtensions({ mode: "tui" });
      const message = assistantMessage([fauxToolCall("bash", args, { id: "observed-settings" })]);
      session.sessionManager.appendMessage(message);
      await tui.handleEvent({ type: "message_start", message });
      await tui.handleEvent({ type: "message_end", message });
      const observed = session.agent.state.tools.find((tool) => tool.name === "bash")!;
      expect(await observed.execute("observed-settings", args)).toEqual(expected);
      expect(
        session.sessionManager
          .getBranch()
          .some((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
      ).toBe(true);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each([null, "kitty"] as const)(
  "preserves an image-bearing grouped sibling with image protocol %s",
  async (images) => {
    const previous = getCapabilities();
    setCapabilityOverrides({ images });

    try {
      await withSession(async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          setCapabilityOverrides({ images });
          const message = assistantMessage([
            fauxToolCall("read", { path: "a.ts" }, { id: "text" }),
            fauxToolCall("read", { path: "image.png" }, { id: "image" }),
            fauxToolCall("read", { path: "after.ts" }, { id: "after-image" })
          ]);
          const result = (toolCallId: string, content: unknown[]) => ({
            role: "toolResult",
            toolCallId,
            toolName: "read",
            content,
            isError: false,
            timestamp: 2
          });
          const image = {
            type: "image",
            mimeType: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC"
          };
          tui.renderSessionItems([
            message,
            result("text", [{ type: "text", text: "hidden text" }]),
            result("image", [image]),
            result("after-image", [{ type: "text", text: "later hidden contents" }])
          ]);
          const rows = tui.chatContainer.children.filter(
            (child) => child instanceof ToolExecutionComponent
          );
          const projected = rows[1]!.render(80).join("\n");
          expect(stripTerminalSequences(projected).startsWith("  ├ Read image.png")).toBe(true);
          expect(projected).not.toContain("Explored");
          const rendered = rows.flatMap((row) => row.render(80)).join("\n");
          const transcript = images ? rendered : stripTerminalSequences(rendered);
          const imagePosition = transcript.indexOf(images ? "\x1b_G" : "[Image: image/png]");
          expect(imagePosition).toBeGreaterThan(transcript.indexOf("image.png"));
          expect(imagePosition).toBeLessThan(transcript.indexOf("after.ts"));
          expect(transcript.split(images ? "\x1b_Ga=T" : "[Image: image/png]")).toHaveLength(2);
          expect(images ? projected : stripTerminalSequences(projected)).toContain(
            images ? "\x1b_G" : "[Image: image/png]"
          );
          rows[0]!.setExpanded(true);
          const expanded = rows[1]!.render(80).join("\n");
          expect(images ? expanded : stripTerminalSequences(expanded)).toContain(
            images ? "\x1b_G" : "[Image: image/png]"
          );
        } finally {
          tui.footerDataProvider.dispose();
        }
      });
    } finally {
      setCapabilityOverrides(previous);
    }
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
          expect(
            session.sessionManager
              .getEntries()
              .filter((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
          ).toEqual([]);
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
      expect(
        session.sessionManager
          .getEntries()
          .filter((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
      ).toEqual([]);
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
      expect(session.sessionManager.getEntries().some((entry) => entry.type === "custom")).toBe(
        false
      );
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it("leaves another mutation subscriber active after display shutdown", async () => {
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
      expect(
        session.sessionManager
          .getEntries()
          .some((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
      ).toBe(true);

      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
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

it("retries saved output after expanding more replayed files than the concurrency limit", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);

    try {
      const calls = Array.from({ length: 9 }, (_, index) =>
        fauxToolCall("bash", { command: `echo ${index}` }, { id: `saved-${index}` })
      );
      const results = await Promise.all(
        calls.map(async (call, index) => {
          const path = join(session.sessionManager.getCwd(), `output-${index}`);
          await writeFile(path, `complete saved output ${index}`);

          return {
            role: "toolResult" as const,
            toolCallId: call.id,
            toolName: "bash",
            content: [{ type: "text" as const, text: `retained ${index}` }],
            details: { fullOutputPath: path },
            isError: false,
            timestamp: 2
          };
        })
      );
      tui.renderSessionItems([assistantMessage(calls), ...results]);
      const rows = tui.chatContainer.children.filter(
        (child) => child instanceof ToolExecutionComponent
      );
      rows.forEach((row) => row.setExpanded(true));
      await vi.waitFor(() => expect(text(rows[0]!)).toContain("complete saved output 0"), {
        interval: 5
      });
      rows[8]!.setExpanded(false);
      rows[8]!.setExpanded(true);
      await vi.waitFor(() => expect(text(rows[8]!)).toContain("complete saved output 8"), {
        interval: 5
      });
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["visible", "suppressed"])(
  "keeps entry grouping consistent during live execution and replay: %s",
  async (renderer) => {
    const visible = renderer === "visible";
    await withSession(async ({ session, extensionFactories }) => {
      extensionFactories.push((pi) => {
        pi.registerEntryRenderer("display-boundary", () =>
          visible ? new Text("Visible boundary") : undefined
        );
      });
      await session.reload();
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        const messages = [
          assistantMessage([fauxToolCall("read", { path: "a.ts" }, { id: "first" })], 1),
          assistantMessage([fauxToolCall("read", { path: "b.ts" }, { id: "second" })], 2)
        ];
        const entryId = session.sessionManager.appendCustomEntry("display-boundary", {});
        const entry = session.sessionManager.getEntry(entryId)!;

        for (const message of messages) {
          await tui.handleEvent({ type: "message_start", message });
          await tui.handleEvent({
            type: "message_update",
            message,
            assistantMessageEvent: {
              type: "toolcall_end",
              contentIndex: 0,
              toolCall: messageToolCall(message),
              partial: message
            }
          });
          await tui.handleEvent({ type: "message_end", message });
          if (message === messages[0]) await tui.handleEvent({ type: "entry_appended", entry });
        }

        const rows = () =>
          tui.chatContainer.children.filter((child) => child instanceof ToolExecutionComponent);
        expect(
          rows()
            .map(text)
            .join("\n")
            .match(/Explor(?:ed|ing)/g) ?? []
        ).toHaveLength(visible ? 0 : 1);
        expect(text(rows()[1]!)).toContain(visible ? "Reading b.ts" : "Reading (queued) b.ts");
        tui.chatContainer.clear();
        tui.renderSessionItems([messages[0], entry, messages[1]]);
        expect(
          rows()
            .map(text)
            .join("\n")
            .match(/Explor(?:ed|ing)/g) ?? []
        ).toHaveLength(visible ? 0 : 1);
        expect(text(rows()[1]!)).toContain("Read outcome unavailable b.ts");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

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

it("marks streamed and replayed assistant prose in regular mode without marking user messages", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session, "regular");
    const user = {
      role: "user" as const,
      content: [{ type: "text" as const, text: "User prose" }],
      timestamp: 1
    };
    const message = {
      ...assistantMessage([{ type: "text", text: "Assistant prose" }], 2),
      stopReason: "stop" as const
    };
    const render = () =>
      tui.chatContainer.render(80).map((row) => stripTerminalSequences(row).trimEnd());

    try {
      tui.renderSessionItems([user]);
      await tui.handleEvent({ type: "message_start", message: { ...message, content: [] } });
      expect(render().some((row) => row.startsWith("•"))).toBe(false);
      await tui.handleEvent({
        type: "message_update",
        message,
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Assistant prose",
          partial: message
        }
      });
      expect(render().filter((row) => row.startsWith("•"))).toEqual(["• Assistant prose"]);
      await tui.handleEvent({ type: "message_end", message });
      const live = render();
      expect(live.filter((row) => row.startsWith("•"))).toEqual(["• Assistant prose"]);
      expect(live.join("\n")).toContain("User prose");
      tui.chatContainer.clear();
      tui.renderSessionItems([user, message]);
      expect(render()).toEqual(live);
      tui.hideThinkingBlock = true;
      tui.updateThinkingBlockVisibility();
      expect(render()).toEqual(live);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(["regular", "fullscreen"] as const)(
  "hides ended thinking blocks during the rest of a streamed message in %s mode",
  async (mode) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session, mode);
      const first = { type: "thinking" as const, thinking: "First thought" };
      const prose = { type: "text" as const, text: "Answer still streaming" };
      const second = { type: "thinking" as const, thinking: "Second thought" };
      const third = { type: "thinking" as const, thinking: "Third thought" };
      const message = assistantMessage([first]);
      const update = (event: Extract<AssistantMessageEvent, { contentIndex: number }>) =>
        tui.handleEvent({
          type: "message_update",
          message: event.partial,
          assistantMessageEvent: event
        });
      const placeholders = () => transcriptText(tui).match(/Thinking\.\.\./g) ?? [];

      try {
        tui.hideThinkingBlock = true;
        tui.renderSessionItems([]);
        await tui.handleEvent({ type: "message_start", message: { ...message, content: [] } });
        await update({
          type: "thinking_delta",
          contentIndex: 0,
          delta: first.thinking,
          partial: message
        });
        expect(placeholders()).toHaveLength(1);
        await update({
          type: "thinking_end",
          contentIndex: 0,
          content: first.thinking,
          partial: message
        });
        expect(placeholders()).toHaveLength(0);

        // Neither global toggles nor invalidation may revive the ended placeholder.
        tui.hideThinkingBlock = false;
        tui.updateThinkingBlockVisibility();
        expect(transcriptText(tui)).toContain(first.thinking);
        tui.hideThinkingBlock = true;
        tui.updateThinkingBlockVisibility();
        tui.chatContainer.invalidate();
        expect(placeholders()).toHaveLength(0);

        const answer = { ...message, content: [first, prose] };
        await update({ type: "text_delta", contentIndex: 1, delta: prose.text, partial: answer });
        expect(transcriptText(tui)).toContain(`• ${prose.text}`);
        expect(placeholders()).toHaveLength(0);

        // Shared partials can already contain later thinking blocks. Ending one
        // must not hide another, including within Pi's consecutive thinking run.
        const buffered = { ...message, content: [first, prose, second, third] };
        const retained = structuredClone(buffered);
        await update({
          type: "thinking_delta",
          contentIndex: 2,
          delta: second.thinking,
          partial: buffered
        });
        expect(placeholders()).toHaveLength(1);
        await update({
          type: "thinking_end",
          contentIndex: 2,
          content: second.thinking,
          partial: buffered
        });
        expect(placeholders()).toHaveLength(1);
        await update({
          type: "thinking_end",
          contentIndex: 3,
          content: third.thinking,
          partial: buffered
        });
        expect(placeholders()).toHaveLength(0);
        expect(buffered).toEqual(retained);

        const toolCall = fauxToolCall("read", { path: "a.ts" }, { id: "after-thinking" });
        const final = { ...buffered, content: [...buffered.content, toolCall] };
        await update({ type: "toolcall_end", contentIndex: 4, toolCall, partial: final });
        expect(placeholders()).toHaveLength(0);
        await tui.handleEvent({ type: "message_end", message: final });
        expect(placeholders()).toHaveLength(0);

        // Completion indices belong to one assistant row, never the next message.
        const next = assistantMessage([first], 2);
        await tui.handleEvent({ type: "message_start", message: next });
        expect(placeholders()).toHaveLength(1);
        await tui.handleEvent({ type: "message_end", message: { ...next, stopReason: "aborted" } });
        expect(placeholders()).toHaveLength(0);
        expect(transcriptText(tui)).toContain("Operation aborted");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it("suppresses completed collapsed thinking without losing text, diagnostics, or toggle boundaries", async () => {
  await withSession(async ({ session }) => {
    const tui = interactiveHost(session);

    try {
      const messages = ["a", "b", "c"].map((id, index) =>
        assistantMessage(
          [
            { type: "thinking", thinking: `Thought ${id}` },
            fauxToolCall("read", { path: `${id}.ts` }, { id })
          ],
          index + 1
        )
      );
      const retained = structuredClone(messages);
      tui.renderSessionItems(messages);
      const render = () => tui.chatContainer.render(80).map(stripTerminalSequences).join("\n");
      expect(render()).toContain("Thought b");
      tui.hideThinkingBlock = true;
      tui.updateThinkingBlockVisibility();
      expect(render()).not.toContain("Thinking...");
      expect(render().match(/Explored/g)).toHaveLength(1);
      expect(render().match(/Read outcome unavailable [abc]\.ts/g)).toHaveLength(3);
      tui.hideThinkingBlock = false;
      tui.updateThinkingBlockVisibility();
      expect(render()).toContain("Thought b");
      expect(render()).not.toContain("Explored");
      const assistants = tui.chatContainer.children.filter(
        (child) => child instanceof AssistantMessageComponent
      );
      const component = assistants[1]!;
      component.setHideThinkingBlock(true);
      component.updateContent(messages[1]!, true);
      expect(render()).toContain("Thinking...");
      component.updateContent(messages[1]!, false);
      expect(render()).not.toContain("Thinking...");
      const diagnostic = {
        ...messages[1]!,
        content: [
          { type: "thinking" as const, thinking: "hidden" },
          { type: "text" as const, text: "Keep this explanation" }
        ],
        stopReason: "error" as const,
        errorMessage: "Keep this error"
      };
      component.updateContent(diagnostic, false);
      expect(render()).toContain("• Keep this explanation");
      expect(render()).toContain("Keep this error");
      expect(messages).toEqual(retained);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each([
  { mode: "live", content: "text" },
  { mode: "live", content: "empty error" },
  { mode: "replay", content: "thinking" },
  { mode: "replay", content: "length" }
])(
  "positions $mode assistant $content boundaries before their tool rows",
  async ({ mode, content }) => {
    await withSession(async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        const messages = ["a", "b", "c"].map((name, index) =>
          assistantMessage([fauxToolCall("read", { path: `${name}.ts` }, { id: name })], index + 1)
        );
        let notice = "Visible explanation";

        if (content === "empty error") {
          const error = assistantMessage([], 1.5);
          error.stopReason = "error";
          error.errorMessage = notice;
          messages.splice(1, 0, error);
        } else if (content === "length") {
          messages[1]!.stopReason = "length";
          notice = "Response was truncated";
        } else {
          messages[1]!.content.push(
            content === "text"
              ? { type: "text", text: notice }
              : { type: "thinking", thinking: notice }
          );
        }

        const history: unknown[] = [];

        for (const message of messages) {
          const call = message.content.find((block) => block.type === "toolCall");

          if (mode === "live") {
            // Text/thinking can arrive after the tool row has already been created.
            const partial = {
              ...message,
              content: call ? [call] : [],
              stopReason: "toolUse" as const
            };
            await tui.handleEvent({ type: "message_start", message: partial });
            if (call)
              await tui.handleEvent({
                type: "message_update",
                message: partial,
                assistantMessageEvent: {
                  type: "toolcall_end",
                  contentIndex: 0,
                  toolCall: call,
                  partial
                }
              });
            await tui.handleEvent({ type: "message_end", message });
          }

          history.push(message);

          if (call) {
            const result = {
              role: "toolResult" as const,
              toolCallId: call.id,
              toolName: "read",
              content: [{ type: "text" as const, text: `body ${call.id}` }],
              isError: false,
              timestamp: message.timestamp
            };
            if (mode === "live")
              await tui.handleEvent({
                type: "tool_execution_end",
                toolCallId: call.id,
                toolName: "read",
                result,
                isError: false
              });
            history.push(result);
          }
        }

        if (mode === "replay") tui.renderSessionItems(history);
        const transcript = tui.chatContainer.render(80).map(stripTerminalSequences).join("\n");
        expect(transcript.indexOf(notice)).toBeGreaterThan(transcript.indexOf("Read a.ts"));
        expect(transcript.indexOf(notice)).toBeLessThan(transcript.indexOf("Read b.ts"));
        const rows = tui.chatContainer.children.filter(
          (child) => child instanceof ToolExecutionComponent
        );
        expect(text(rows[0]!)).toContain("• Read a.ts");
        expect(text(rows[1]!)).toContain("• Explored");
        expect(text(rows[2]!)).not.toContain("• Explored");
        expect(rows[1]!.render(80)[0]).toBe("");
        expect(rows[2]!.render(80)[0]).not.toBe("");
        rows[1]!.setExpanded(true);
        expect(text(rows[0]!)).not.toContain("body a");
        expect(text(rows[1]!)).toContain("body b");
        expect(text(rows[2]!)).toContain("body c");
      } finally {
        tui.footerDataProvider.dispose();
      }
    });
  }
);

it.each([
  ...[false, true].flatMap((entryVisible) =>
    ["before", "after"].map((position) => ({ entryVisible, position }))
  ),
  { entryVisible: true, position: "none" }
])(
  "preserves streaming call identity and custom-entry boundaries (entry: $entryVisible, withdrawn text: $position)",
  async ({ entryVisible, position }) => {
    await withSession(async ({ session, extensionFactories }) => {
      extensionFactories.push((pi) => {
        pi.registerEntryRenderer("retained-boundary", () => new Text("Retained entry"));
      });
      await session.reload();
      const tui = interactiveHost(session);

      try {
        tui.renderSessionItems([]);
        const history: unknown[] = [];

        for (const [index, name] of ["a", "b", "c"].entries()) {
          const call = fauxToolCall("read", { path: `${name}.ts` }, { id: name });
          const message = assistantMessage([call], index + 1);
          const partial = { ...message, content: [...message.content] };

          if (name === "b" && position !== "none") {
            const withdrawn = { type: "text" as const, text: "Withdrawn text" };
            if (position === "before") partial.content.unshift(withdrawn);
            else partial.content.push(withdrawn);
          }

          await tui.handleEvent({ type: "message_start", message: partial });
          await tui.handleEvent({
            type: "message_update",
            message: partial,
            assistantMessageEvent: {
              type: "toolcall_end",
              contentIndex: partial.content.findIndex((part) => part.type === "toolCall"),
              toolCall: call,
              partial
            }
          });

          if (name === "b") {
            const row = tui.chatContainer.children
              .filter((child) => child instanceof ToolExecutionComponent)
              .at(-1)!;
            if (position !== "none") expect(text(row)).toContain("Reading");
            expect(row.render(80)[0] === "").toBe(position !== "none");

            if (entryVisible) {
              const id = session.sessionManager.appendCustomEntry("retained-boundary", {});
              const entry = session.sessionManager.getEntry(id)!;
              history.push(entry);
              await tui.handleEvent({ type: "entry_appended", entry });
            }
          }

          // Public message_end middleware may replace the finalized assistant content.
          await tui.handleEvent({ type: "message_end", message });
          const result = {
            role: "toolResult" as const,
            toolCallId: name,
            toolName: "read",
            content: [{ type: "text" as const, text: `body ${name}` }],
            isError: name === "b" && position === "before",
            timestamp: index + 1
          };
          await tui.handleEvent({
            type: "tool_execution_end",
            toolCallId: name,
            toolName: "read",
            result,
            isError: result.isError
          });
          history.push(message, result);
        }

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionItems(history);
          }

          const transcript = tui.chatContainer.render(80).map(stripTerminalSequences).join("\n");
          expect(transcript).not.toContain("Withdrawn text");
          expect(transcript.includes("Retained entry")).toBe(entryVisible);
          expect(transcript.match(/• Explored/g)).toHaveLength(1);
          const rows = tui.chatContainer.children.filter(
            (child) => child instanceof ToolExecutionComponent
          );
          expect(rows).toHaveLength(3);

          if (entryVisible) {
            expect(transcript.indexOf("Retained entry")).toBeGreaterThan(
              transcript.indexOf("Read a.ts")
            );
            expect(transcript.indexOf("Retained entry")).toBeLessThan(
              transcript.indexOf(position === "before" ? "Read failed b.ts" : "Read b.ts")
            );
            expect(text(rows[0]!)).toContain("• Read a.ts");
            expect(text(rows[1]!)).toContain("• Explored");
          }

          expect(text(rows[2]!)).not.toContain("• Explored");
          expect(rows[1]!.render(80)[0] === "").toBe(entryVisible);
          expect(text(rows[1]!).includes("body b")).toBe(position === "before");
          expect(text(rows[2]!)).not.toContain("body b");
          expect(text(rows[2]!)).toContain("└ Read c.ts");
          rows[1]!.setExpanded(true);
          expect(text(rows[0]!).includes("body a")).toBe(!entryVisible);
          expect(text(rows[1]!)).toContain("body b");
          expect(text(rows[2]!)).toContain("body c");
          expect(text(rows[2]!)).not.toContain("body b");
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

          const facts = session.sessionManager
            .getBranch()
            .filter((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE);
          expect(facts).toHaveLength(1);
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

it.each(["auto", "generic"])(
  "uses finalized arguments in %s live summaries and expanded parameters",
  async (renderer) => {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          tui.renderSessionItems([]);
          const directory = session.sessionManager.getCwd();
          await writeFile(join(directory, "before.ts"), "BEFORE_TARGET");
          await writeFile(join(directory, "after.ts"), "AFTER_TARGET");
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
          const call = fauxToolCall("read", { path: "after.ts" }, { id: streamedCall.id });
          const finalized = assistantMessage([call]);
          session.sessionManager.appendMessage(finalized);
          await tui.handleEvent({ type: "message_end", message: finalized });
          await tui.handleEvent({
            type: "tool_execution_start",
            toolCallId: call.id,
            toolName: "read",
            args: call.arguments
          });
          const tool = session.agent.state.tools.find((tool) => tool.name === "read")!;
          const result = await tool.execute(call.id, call.arguments);
          expect(result.content).toEqual([{ type: "text", text: "AFTER_TARGET" }]);
          await tui.handleEvent({
            type: "tool_execution_end",
            toolCallId: call.id,
            toolName: "read",
            result,
            isError: false
          });
          session.sessionManager.appendMessage({
            role: "toolResult",
            toolCallId: call.id,
            toolName: "read",
            ...result,
            isError: false,
            timestamp: 2
          });
          const renderings: string[] = [];

          for (const replay of [false, true]) {
            if (replay) {
              tui.chatContainer.clear();
              tui.renderSessionEntries(session.sessionManager.buildContextEntries());
            }

            const row = tui.chatContainer.children.find(
              (child) => child instanceof ToolExecutionComponent
            )!;

            for (const expanded of [false, true]) {
              row.setExpanded(expanded);
              const rendered = text(row);
              expect(rendered).toContain("after.ts");
              expect(rendered).not.toContain("before.ts");

              if (expanded) {
                expect(rendered).toContain('"path"');
                expect(rendered).toContain("AFTER_TARGET");
              }

              renderings.push(rendered);
            }
          }

          expect(renderings.slice(0, 2)).toEqual(renderings.slice(2));
          expect(streamedCall.arguments.path).toBe("before.ts");
          expect(call.arguments.path).toBe("after.ts");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { showParameters: true, rendererOverrides: { read: renderer } }
    );
  }
);

it.each(["maybeShowThinkingDropNotice", "addCacheMissNotice", "addCacheWarmingUsage"] as const)(
  "separates live groups only when %s inserts a component",
  async (hook) => {
    const prototype = interactivePrototype();
    const notice = new Text("fixture notice", 0, 0);
    const returned = {};
    // Pi owns notice eligibility. Exercise our wrapper with insertion and no-op results.
    const insert = vi.spyOn(prototype, hook).mockImplementation(function (
      this: Host,
      value: unknown
    ) {
      const children = this.chatContainer?.children;
      if (value !== "insert" || !children) return returned;
      const firstRow = children.findIndex((child) => child instanceof ToolExecutionComponent);
      children.splice(firstRow + 1, 0, notice);

      return returned;
    });

    try {
      await withSession(async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          const history = ["a", "b", "c"].map((name, index) => ({
            message: assistantMessage(
              [fauxToolCall("read", { path: `${name}.ts` }, { id: name })],
              index + 1
            ),
            result: {
              role: "toolResult" as const,
              toolCallId: name,
              toolName: "read",
              content: [{ type: "text" as const, text: `body ${index + 1}` }],
              isError: false,
              timestamp: index + 1
            }
          }));

          const renderLive = async ({ message, result }: (typeof history)[number]) => {
            await tui.handleEvent({ type: "message_start", message });
            await tui.handleEvent({
              type: "message_update",
              message,
              assistantMessageEvent: {
                type: "toolcall_end",
                contentIndex: 0,
                toolCall: messageToolCall(message),
                partial: message
              }
            });
            await tui.handleEvent({ type: "message_end", message });
            await tui.handleEvent({
              type: "tool_execution_end",
              toolCallId: result.toolCallId,
              toolName: "read",
              result,
              isError: false
            });
          };

          const rows = () =>
            tui.chatContainer.children.filter((child) => child instanceof ToolExecutionComponent);
          const groups = () =>
            rows()
              .map(text)
              .join("\n")
              .match(/Explored/g);

          tui.renderSessionItems([]);
          await renderLive(history[0]!);
          insert.mockClear();
          expect(prototype[hook]!.call(tui, "skip")).toBe(returned);
          expect(insert).toHaveBeenCalledExactlyOnceWith("skip");
          expect(insert.mock.contexts[0]).toBe(tui);
          await renderLive(history[1]!);
          expect(groups()).toHaveLength(1);
          expect(tui.chatContainer.children).not.toContain(notice);

          insert.mockClear();
          expect(prototype[hook]!.call(tui, "insert")).toBe(returned);
          expect(insert).toHaveBeenCalledExactlyOnceWith("insert");
          expect(insert.mock.contexts[0]).toBe(tui);
          await renderLive(history[2]!);
          expect(tui.chatContainer.children.filter((child) => child === notice)).toHaveLength(1);
          expect(groups()).toHaveLength(1);
          const [first, second, third] = rows();
          expect(second!.render(80)[0]).toBe("");
          second!.setExpanded(true);
          expect(text(second!)).toContain("body 2");
          expect(text(third!)).toContain("body 3");
          expect(text(first!)).not.toContain("body 1");
        } finally {
          tui.footerDataProvider.dispose();
        }
      });
    } finally {
      insert.mockRestore();
    }
  }
);

it("separates summaries and expansion at public warning notifications", async () => {
  await withSession(
    async ({ session }) => {
      const tui = interactiveHost(session);
      const appendRead = (id: string, timestamp: number) =>
        tui.renderSessionItems([
          assistantMessage([fauxToolCall("read", { path: `${id}.ts` }, { id })], timestamp),
          {
            role: "toolResult",
            toolCallId: id,
            toolName: "read",
            content: [{ type: "text", text: `body ${id}` }],
            isError: false,
            timestamp
          }
        ]);

      try {
        appendRead("a", 1);
        tui.toggleThinkingBlockVisibility();
        appendRead("b", 2);
        expect(transcriptText(tui)).toContain("Read 2 files");
        tui.showExtensionNotify!("Public notification", "warning");
        appendRead("c", 3);
        const transcript = transcriptText(tui);
        expect(transcript.match(/Read 2 files/g)).toHaveLength(1);
        expect(transcript.match(/Read 1 file/g)).toHaveLength(1);
        expect(transcript.match(/Public notification/g)).toHaveLength(1);
        expect(transcript).toContain("Warning: Public notification");
        tui.toggleToolOutputExpansion!();
        const [first, second, third] = tui.chatContainer.children.filter(
          (child) => child instanceof ToolExecutionComponent
        );
        expect(text(first!)).toContain("Explored");
        expect(text(third!)).not.toContain("Explored");
        first!.setExpanded(true);
        expect(text(first!)).toContain("body a");
        expect(text(second!)).toContain("body b");
        expect(text(third!)).not.toContain("body c");
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { collapsedMode: "summary" }
  );
});

it("removes the hook outside TUI mode, including reload", async () => {
  const original = host.getRegisteredToolDefinition;
  await withSession(async ({ session, assertNoRegistration }) => {
    const assertPreserved = preserveRegistry(session);
    await session.bindExtensions({ mode: "rpc", onError: () => {} });
    expect(host.getRegisteredToolDefinition).toBe(original);
    assertPreserved();
    await session.reload();
    expect(host.getRegisteredToolDefinition).toBe(original);
    assertNoRegistration();
  });
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
          const definition = { ...createReadToolDefinition("/tmp"), name };
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

it("returns an available original view when decoration fails and never retries a failing previous lookup", () => {
  const original = host.getRegisteredToolDefinition;
  const session: LookupSession = { ...lookupSession(), getToolDefinition: () => undefined };
  const view = original.call({ session }, "read");
  const previous = vi.fn().mockReturnValue(view);
  host.getRegisteredToolDefinition = previous;
  const dispose = installHostIntegration();

  try {
    const ownershipFailure = vi.fn(() => {
      throw new Error("ownership unavailable");
    });
    session.getAllTools = ownershipFailure;
    expect(host.getRegisteredToolDefinition.call({ session }, "read")).toBe(view);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(ownershipFailure).toHaveBeenCalledOnce();

    session.getAllTools = lookupSession().getAllTools;
    const copyFailure = vi.fn(() => {
      throw new Error("cannot copy view");
    });
    const invalidView = Object.defineProperty({}, "renderCall", {
      enumerable: true,
      get: copyFailure
    });
    previous.mockReturnValue(invalidView);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")).toBe(invalidView);
    expect(previous).toHaveBeenCalledTimes(2);
    expect(copyFailure).toHaveBeenCalledOnce();

    previous.mockReturnValue(undefined);
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).toBe("self");
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
  const firstDispose = installHostIntegration();
  const secondDispose = installHostIntegration();
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
    const session = {
      ...lookupSession(),
      getToolDefinition: () => undefined
    };
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

it("keeps instruction notices inside live and replayed runs, including trailing collapse controls", async () => {
  await withSession(
    async ({ session }) => {
      const tui = interactiveHost(session);
      const history: unknown[] = [];
      let timestamp = 0;

      const notice = async (name: string, appended = false) => {
        const cwd = session.sessionManager.getCwd();
        const message = {
          role: "custom" as const,
          timestamp: ++timestamp,
          ...noticeEntry(
            join(cwd, name),
            { path: join(cwd, name, "AGENTS.md"), stamp: name, content: `Rules for ${name}` },
            "loaded",
            cwd
          )
        };
        history.push(message);

        if (appended) {
          const id = session.sessionManager.appendCustomMessageEntry(
            message.customType,
            message.content,
            message.display,
            message.details
          );
          await tui.handleEvent({
            type: "entry_appended",
            entry: session.sessionManager.getEntry(id)!
          });
        } else await tui.handleEvent({ type: "message_start", message });
      };

      const read = async (path: string) => {
        const message = assistantMessage(
          [fauxToolCall("read", { path }, { id: path })],
          ++timestamp
        );
        await tui.handleEvent({ type: "message_start", message: { ...message, content: [] } });
        await tui.handleEvent({
          type: "message_update",
          message,
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: messageToolCall(message, 0),
            partial: message
          }
        });
        await tui.handleEvent({ type: "message_end", message });
        const result = {
          role: "toolResult" as const,
          toolCallId: path,
          toolName: "read",
          content: [{ type: "text" as const, text: `Contents of ${path}` }],
          isError: false,
          timestamp: ++timestamp
        };
        history.push(message, result);
        await tui.handleEvent({
          type: "tool_execution_end",
          toolCallId: path,
          toolName: "read",
          result,
          isError: false
        });
      };

      const click = (row: ToolExecutionComponent | CustomMessageComponent, y: number) => {
        const height = row.render(100).length;
        expect(
          row.handleMouse({
            type: "click",
            button: "left",
            x: 2,
            y,
            screenX: 2,
            screenY: y,
            width: 100,
            height,
            shift: false,
            alt: false,
            ctrl: false
          })
        ).toMatchObject({ handled: true });
      };

      try {
        await session.bindExtensions({ mode: "tui" });
        tui.renderSessionItems([]);
        await notice("orphan");
        await read("a.ts");
        await notice("middle");
        expect(transcriptText(tui)).toContain("Read a.ts");
        expect(transcriptText(tui)).not.toContain("Read 1 file");
        await read("b.ts");
        await notice("tail-one");
        await notice("tail-two", true);
        const boundary = {
          role: "custom" as const,
          customType: "other",
          content: "Other boundary",
          display: true,
          timestamp: ++timestamp
        };
        history.push(boundary);
        await tui.handleEvent({ type: "message_start", message: boundary });
        await notice("outside");
        await read("c.ts");
        await tui.handleEvent({ type: "agent_end", messages: [], willRetry: false });

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionItems(history);
          }

          const collapsed = transcriptText(tui);
          expect(collapsed).toContain("Read 2 files · loaded 3 instruction files");
          expect(collapsed).toMatch(/^ {2}Read 1 file$/m);
          expect(collapsed).toContain("Loaded orphan/AGENTS.md");
          expect(collapsed).toContain("Loaded outside/AGENTS.md");
          expect(collapsed).not.toContain("Loaded middle/AGENTS.md");
          expect(collapsed).not.toContain("Loaded tail-");
          const leader = tui.chatContainer.children.find(
            (row) => row instanceof ToolExecutionComponent
          )!;
          click(leader, 1);
          const opened = transcriptText(tui).split("Other boundary")[0]!;
          const ordered = [
            "Read a.ts",
            "Loaded middle/AGENTS.md",
            "Read b.ts",
            "Loaded tail-one/AGENTS.md",
            "Loaded tail-two/AGENTS.md"
          ];
          let position = -1;

          for (const label of ordered) {
            expect(opened.indexOf(label)).toBeGreaterThan(position);
            position = opened.indexOf(label);
          }

          expect(opened).not.toContain("Explored");
          expect(opened.match(/─{100}/g)).toHaveLength(2);
          expect(opened.lastIndexOf("─".repeat(100))).toBeGreaterThan(position);
          const notices = tui.chatContainer.children.filter(
            (row) => row instanceof CustomMessageComponent
          );
          const middle = notices.find((row) => row.render(100).join("").includes("middle/"))!;
          click(middle, 1);
          expect(transcriptText(tui)).toContain("Rules for middle");
          expect(transcriptText(tui)).not.toContain("Contents of a.ts");
          const tail = notices.find((row) => row.render(100).join("").includes("tail-two/"))!;
          click(tail, tail.render(100).length - 1);
          expect(transcriptText(tui)).toContain("Read 2 files · loaded 3 instruction files");
          expect(middle.render(100)).toEqual([]);
          expect(tail.render(100)).toEqual([]);
          click(leader, 1);
          expect(transcriptText(tui)).toContain("Rules for middle");
          tui.toggleToolOutputExpansion?.(); // compact
          expect(transcriptText(tui)).not.toContain("─".repeat(100));
          tui.toggleToolOutputExpansion?.(); // verbose
          expect(transcriptText(tui)).toContain("Rules for tail-two");
          tui.toggleToolOutputExpansion?.(); // summary
          expect(middle.render(100)).toEqual([]);
        }
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { collapsedMode: "summary" }
  );
});

it("cycles summary, compact, and verbose with Ctrl+O and names the mode in the status", async () => {
  await withSession(
    async ({ session }) => {
      const tui = interactiveHost(session);

      try {
        await session.bindExtensions({ mode: "tui" });
        tui.renderSessionItems(summaryHistory(session));
        expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
        expect(transcriptText(tui)).not.toContain("npm ERR! missing script");
        expect(transcriptText(tui)).not.toContain("Explored");

        const cycle = (expected: string) => {
          tui.toggleToolOutputExpansion?.();
          expect(transcriptText(tui).trimEnd().split("\n").at(-1)?.trim()).toBe(
            `Tool output: ${expected}`
          );
        };

        cycle("compact");
        expect(tui.toolOutputExpanded).toBe(false);
        expect(transcriptText(tui)).toContain("• Explored .");
        expect(transcriptText(tui)).not.toContain("retained a");
        cycle("verbose");
        expect(tui.toolOutputExpanded).toBe(true);
        expect(transcriptText(tui)).toContain("retained a");
        cycle("summary");
        expect(tui.toolOutputExpanded).toBe(false);
        expect(transcriptText(tui)).not.toContain("retained a");
        expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
        // Repeated status messages replace one line instead of accumulating.
        expect(transcriptText(tui).match(/Tool output:/g)).toHaveLength(1);
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { collapsedMode: "summary" }
  );
});

it.each(["summary", "compact"] as const)(
  "maps expansion requests to %s and retains changed modes through reconstruction and reload",
  async (collapsedMode) => {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          await session.bindExtensions({
            mode: "tui",
            onError: (error) => {
              throw new Error(error.error);
            }
          });
          tui.renderSessionItems(summaryHistory(session));
          const configuration = session.settingsManager.getGlobalSettings();
          const status = () => transcriptText(tui).match(/Tool output: \w+/g) ?? [];
          tui.setToolsExpanded?.(false);
          expect(status()).toEqual([]);
          tui.setToolsExpanded?.(true);
          expect(tui.toolOutputExpanded).toBe(true);
          expect(status()).toEqual(["Tool output: verbose"]);
          tui.setToolsExpanded?.(false);
          expect(tui.toolOutputExpanded).toBe(false);
          expect(status()).toEqual([`Tool output: ${collapsedMode}`]);

          if (collapsedMode === "compact") {
            tui.toggleToolOutputExpansion?.();
            expect(status()).toEqual(["Tool output: verbose"]);
            tui.toggleToolOutputExpansion?.();
            expect(status()).toEqual(["Tool output: summary"]);
          } else tui.toggleToolOutputExpansion?.();

          const changedMode = collapsedMode === "compact" ? "summary" : "compact";

          const assertMode = () => {
            const rendered = transcriptText(tui);
            expect(tui.toolOutputExpanded).toBe(false);
            expect(rendered).toContain(
              changedMode === "summary" ? "Read 2 files · ran 1 command (1 failed)" : "• Explored ."
            );
            expect(rendered).not.toContain(
              changedMode === "summary" ? "• Explored ." : "Read 2 files · ran 1 command (1 failed)"
            );
            expect(rendered).not.toContain("retained a");
          };

          const reconstruct = () => {
            tui.chatContainer.clear();
            tui.renderSessionEntries(session.sessionManager.buildContextEntries());
            assertMode();
          };

          assertMode();
          reconstruct();
          await session.reload({ beforeSessionStart: reconstruct });
          assertMode();
          expect(session.settingsManager.getGlobalSettings()).toEqual(configuration);
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode }
    );
  }
);

it("keeps nested codemode calls in the built-in parent card without duplicate summaries or persisted child facts", async () => {
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
        expect(
          branch.filter((entry) => entry.type === "custom" && entry.customType === METADATA_TYPE)
        ).toHaveLength(0);

        for (const replay of [false, true]) {
          if (replay) {
            tui.chatContainer.clear();
            tui.renderSessionEntries(session.sessionManager.buildContextEntries());
          }

          expect(
            tui.chatContainer.children.filter((child) => child instanceof ToolExecutionComponent)
          ).toHaveLength(1);
          // The script counts once; its nested calls never become transcript calls.
          const summary = transcriptText(tui);
          expect(summary).toContain("Ran 1 script");
          expect(summary).not.toMatch(
            /Read \d+ files?|ran \d+ commands?|edited|created|• Explored/
          );
        }

        tui.toggleToolOutputExpansion?.();
        const card = transcriptText(tui);
        for (const row of [
          "• Ran script",
          "✓ read",
          "✓ edit",
          "✓ write",
          "✓ bash",
          "nested-output"
        ])
          expect(card).toContain(row);
        expect(card).not.toContain("Script completed");
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

it("starts verbose with Pi's verbose startup option", async () => {
  await withSession(
    async ({ session }) => {
      const tui = interactiveHost(session);
      // Pi's --verbose option is private construction state.
      Reflect.set(
        tui,
        "options",
        Object.assign({}, Reflect.get(tui, "options"), { verbose: true })
      );

      try {
        await session.bindExtensions({ mode: "tui" });
        tui.renderSessionItems(summaryHistory(session));
        expect(tui.toolOutputExpanded).toBe(true);
        expect(transcriptText(tui)).toContain("retained a");
        tui.toggleToolOutputExpansion?.();
        expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { collapsedMode: "summary" }
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
          const rows = tui.chatContainer.children.filter(
            (child) => child instanceof ToolExecutionComponent
          );
          expect(rows.every((child) => !Object.hasOwn(child, "render"))).toBe(true);
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

it.each([true, false])(
  "keeps thinking-only turns from settling a run (hidden: %s)",
  async (hidden) => {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);
        const history: unknown[] = [];
        const thought = { type: "thinking" as const, thinking: "Considering the next file" };
        const first = assistantMessage(
          [fauxToolCall("read", { path: "a.ts" }, { id: "thinking-read-a" })],
          1
        );
        const next = assistantMessage(
          [thought, fauxToolCall("read", { path: "b.ts" }, { id: "thinking-read-b" })],
          2
        );

        const finishCall = async (message: typeof first, contentIndex: number) => {
          const call = messageToolCall(message, contentIndex);
          await tui.handleEvent({
            type: "message_update",
            message,
            assistantMessageEvent: {
              type: "toolcall_end",
              contentIndex,
              toolCall: call,
              partial: message
            }
          });
          await tui.handleEvent({ type: "message_end", message });
          const result = {
            role: "toolResult" as const,
            toolCallId: call.id,
            toolName: call.name,
            content: [{ type: "text" as const, text: "retained file" }],
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
          history.push(message, result);
        };

        try {
          await session.bindExtensions({ mode: "tui" });
          tui.hideThinkingBlock = hidden;
          tui.renderSessionItems([]);
          await tui.handleEvent({ type: "message_start", message: { ...first, content: [] } });
          await finishCall(first, 0);
          expect(transcriptText(tui)).toContain("Read a.ts");

          await tui.handleEvent({ type: "message_start", message: { ...next, content: [] } });
          const partial = { ...next, content: [thought] };
          await tui.handleEvent({
            type: "message_update",
            message: partial,
            assistantMessageEvent: {
              type: "thinking_delta",
              contentIndex: 0,
              delta: thought.thinking,
              partial
            }
          });
          const thinking = transcriptText(tui);
          expect(thinking).toContain(hidden ? "Thinking..." : thought.thinking);
          expect(thinking).toContain("Read a.ts");
          expect(thinking).not.toContain("Read 1 file");
          await tui.handleEvent({
            type: "message_update",
            message: partial,
            assistantMessageEvent: {
              type: "thinking_end",
              contentIndex: 0,
              content: thought.thinking,
              partial
            }
          });
          expect(transcriptText(tui)).not.toContain("Thinking...");
          expect(transcriptText(tui).includes(thought.thinking)).toBe(!hidden);
          expect(transcriptText(tui)).toContain("Read a.ts");
          expect(transcriptText(tui)).not.toContain("Read 1 file");

          await finishCall(next, 1);
          expect(transcriptText(tui)).toContain(hidden ? "Explored" : thought.thinking);
          expect(transcriptText(tui)).not.toMatch(/Read [12] files?/);

          // Both the global toggle and native per-block click only change layout.
          tui.hideThinkingBlock = false;
          tui.updateThinkingBlockVisibility();
          const assistant = tui.chatContainer.children
            .filter((child) => child instanceof AssistantMessageComponent)
            .at(-1)!;
          const click = {
            type: "click" as const,
            button: "left" as const,
            x: 2,
            y: 1,
            screenX: 2,
            screenY: 1,
            width: 100,
            height: assistant.render(100).length,
            shift: false,
            alt: false,
            ctrl: false
          };
          expect(assistant.handleMouse(click)).toMatchObject({ handled: true });
          expect(transcriptText(tui)).not.toContain(thought.thinking);
          expect(transcriptText(tui)).toContain("Explored");
          expect(transcriptText(tui)).not.toMatch(/Read [12] files?/);

          await tui.handleEvent({ type: "agent_end", messages: [], willRetry: false });

          for (const replay of [false, true]) {
            if (replay) {
              tui.chatContainer.clear();
              tui.renderSessionItems(history);
            }

            for (const hide of [false, true, false]) {
              tui.hideThinkingBlock = hide;
              tui.updateThinkingBlockVisibility();
              const ended = transcriptText(tui);
              expect(ended).toContain("Read 2 files");
              expect(ended).not.toContain("Read 1 file");
              expect(ended).not.toContain("Explored");
              expect(ended.includes(thought.thinking)).toBe(!hide);
            }
          }
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode: "summary" }
    );
  }
);

it.each(["prose", "error", "length"] as const)(
  "keeps a live run compact through thinking until assistant %s ends it",
  async (boundary) => {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session);

        try {
          await session.bindExtensions({ mode: "tui" });
          tui.renderSessionItems([]);
          const message = assistantMessage([
            fauxToolCall("read", { path: "a.ts" }, { id: "live-read" }),
            fauxToolCall("bash", { command: "npm test" }, { id: "live-shell" })
          ]);
          await tui.handleEvent({ type: "message_start", message: { ...message, content: [] } });

          for (const [contentIndex, call] of message.content.entries())
            if (call.type === "toolCall")
              await tui.handleEvent({
                type: "message_update",
                message,
                assistantMessageEvent: {
                  type: "toolcall_end",
                  contentIndex,
                  toolCall: call,
                  partial: message
                }
              });

          await tui.handleEvent({ type: "message_end", message });
          const text = (value: string) => ({
            content: [{ type: "text" as const, text: value }],
            details: undefined
          });

          for (const [id, name, output] of [
            ["live-read", "read", "a"],
            ["live-shell", "bash", "done"]
          ] as const) {
            await tui.handleEvent({
              type: "tool_execution_start",
              toolCallId: id,
              toolName: name,
              args: {}
            });
            await tui.handleEvent({
              type: "tool_execution_end",
              toolCallId: id,
              toolName: name,
              result: text(output),
              isError: false
            });
          }

          // Finished calls stay compact while the next turn could still extend the run.
          const finished = transcriptText(tui);
          expect(finished).toContain("Ran npm test");
          expect(finished).not.toContain("Read 1 file");

          const thought = { type: "thinking" as const, thinking: "Reviewing the results" };
          const partial = assistantMessage([thought], 3);
          await tui.handleEvent({ type: "message_start", message: { ...partial, content: [] } });
          await tui.handleEvent({
            type: "message_update",
            message: partial,
            assistantMessageEvent: {
              type: "thinking_delta",
              contentIndex: 0,
              delta: thought.thinking,
              partial
            }
          });
          expect(transcriptText(tui)).toContain("Ran npm test");
          expect(transcriptText(tui)).not.toContain("Read 1 file");
          const reply = {
            ...partial,
            content:
              boundary === "prose"
                ? [thought, { type: "text" as const, text: "All done" }]
                : [thought],
            stopReason: boundary === "prose" ? ("stop" as const) : boundary,
            ...(boundary === "error" ? { errorMessage: "Response failed" } : {})
          };
          await tui.handleEvent({ type: "message_end", message: reply });
          const ended = transcriptText(tui);
          expect(ended).toContain("Read 1 file · ran 1 command");
          expect(ended).not.toContain("Ran npm test");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode: "summary" }
    );
  }
);

it("renders summary mode as compact outside fullscreen and follows TUI mode switches", async () => {
  const prototype = interactivePrototype();
  const originalSwitch = prototype.switchTuiMode;

  // Pi's switch replaces the renderer; the fixture only needs the new mode.
  prototype.switchTuiMode = function (this: Host, mode: unknown) {
    this.ui = renderingTui(mode === "fullscreen" ? "fullscreen" : "regular");

    return true;
  };

  try {
    await withSession(
      async ({ session }) => {
        const tui = interactiveHost(session, "regular");

        try {
          await session.bindExtensions({ mode: "tui" });
          tui.renderSessionItems(summaryHistory(session));
          const status = () => transcriptText(tui).match(/Tool output: \w+/g) ?? [];
          expect(transcriptText(tui)).toContain("• Explored .");
          expect(transcriptText(tui)).not.toContain("Read 2 files");
          // The cycle skips the step that would look identical.
          tui.toggleToolOutputExpansion?.();
          expect(status()).toEqual(["Tool output: verbose"]);
          tui.toggleToolOutputExpansion?.();
          expect(status()).toEqual(["Tool output: compact"]);

          tui.switchTuiMode?.("fullscreen");
          expect(transcriptText(tui)).toContain("Read 2 files · ran 1 command (1 failed)");
          tui.switchTuiMode?.("regular");
          expect(transcriptText(tui)).toContain("• Explored .");
        } finally {
          tui.footerDataProvider.dispose();
        }
      },
      { collapsedMode: "summary" }
    );
  } finally {
    Reflect.set(prototype, "switchTuiMode", originalSwitch);
  }
});
