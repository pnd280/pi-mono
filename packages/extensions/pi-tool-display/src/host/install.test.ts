import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxToolCall } from "@earendil-works/pi-ai";
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
  AgentSession,
  AssistantMessageComponent,
  type AgentSessionRuntime,
  type AgentSessionEvent,
  type ExtensionAPI,
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
import { expect, it, vi } from "vite-plus/test";

import toolDisplay from "../index.ts";
import { assistantMessage, messageToolCall, renderingTui } from "../test-fixture.ts";
import { METADATA_TYPE } from "../transcript/metadata.ts";
import { interactivePrototype, type Host } from "./compatibility.ts";
import { installHostIntegration } from "./install.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];

type LookupSession = Pick<AgentSession, "getAllTools" | "settingsManager" | "sessionManager"> & {
  getToolDefinition: (name: string) => RenderDefinition;
};

// Pi 0.85.1's lookup is private; exercise its actual implementation without starting a terminal.
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
    getAllTools: () => [{ ...definition, sourceInfo: createSyntheticSourceInfo(name, { source }) }]
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

function interactiveHost(session: AgentSession) {
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
  // Exercise Pi 0.85.1's private reconstruction/event paths without terminal startup.
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
  };
  boundary.ui = renderingTui();
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
  baseToolsOverride?: ConstructorParameters<typeof AgentSession>[0]["baseToolsOverride"]
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
      images: { autoResize: false },
      ...(displayConfiguration === undefined ? {} : { "ext.pi-tool-display": displayConfiguration })
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
    expect(text(live)).toContain("◦ Reading example.txt");
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
        await session.bindExtensions({ mode: "tui" });
        await session.reload({ beforeSessionStart: reconstruct });
        assertNoRegistration();
      } finally {
        tui.footerDataProvider.dispose();
      }
    },
    { showParameters: true }
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

it.each([false, true])(
  "retries saved output after replaying more files than the concurrency limit (expand all: %s)",
  async (expandAll) => {
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
        if (expandAll) rows.forEach((row) => row.setExpanded(true));
        else rows[0]!.setExpanded(true);
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
  }
);

it.each(["visible", "suppressed", "unregistered"])(
  "keeps entry grouping consistent during live execution and replay: %s",
  async (renderer) => {
    const visible = renderer === "visible";
    await withSession(async ({ session, extensionFactories }) => {
      extensionFactories.push((pi) => {
        if (renderer !== "unregistered")
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
        expect(text(rows()[1]!)).toContain(visible ? "Reading b.ts" : "Read (queued) b.ts");
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
      expect(render()).toContain("Keep this explanation");
      expect(render()).toContain("Keep this error");
      expect(messages).toEqual(retained);
    } finally {
      tui.footerDataProvider.dispose();
    }
  });
});

it.each(
  ["live", "replay"].flatMap((mode) =>
    ["text", "thinking", "empty error", "length"].map((content) => ({ mode, content }))
  )
)(
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
          const partial = structuredClone(message);

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

it.each(["read", "write"].flatMap((name) => [false, true].map((isError) => ({ name, isError }))))(
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

it.each(
  ["live", "replay"].flatMap((mode) =>
    (["maybeShowAssistantDiagnostics", "addCacheMissNotice"] as const).map((hook) => ({
      mode,
      hook
    }))
  )
)("separates $mode groups only when $hook inserts a component", async ({ mode, hook }) => {
  const prototype = interactivePrototype();
  const notice = new Text("fixture notice", 0, 0);
  // Pi owns notice eligibility. Exercise our wrapper with insertion and no-op results.
  const insert = vi.spyOn(prototype, hook).mockImplementation(function (this: Host, value) {
    const children = this.chatContainer?.children;
    if (value !== notice || !children) return;
    const firstRow = children.findIndex((child) => child instanceof ToolExecutionComponent);
    children.splice(firstRow + 1, 0, notice);
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

        tui.renderSessionItems(
          mode === "replay" ? history.flatMap(({ message, result }) => [message, result]) : []
        );
        if (mode === "live") await renderLive(history[0]!);
        insert.mockClear();
        const snapshot = vi.spyOn(tui.chatContainer.children, "slice");
        prototype[hook]!.call(tui, undefined);
        expect(snapshot).not.toHaveBeenCalled();
        snapshot.mockRestore();
        expect(insert).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(insert.mock.contexts[0]).toBe(tui);
        if (mode === "live") await renderLive(history[1]!);
        expect(groups()).toHaveLength(1);
        expect(tui.chatContainer.children).not.toContain(notice);

        insert.mockClear();
        prototype[hook]!.call(tui, notice);
        expect(insert).toHaveBeenCalledExactlyOnceWith(notice);
        expect(insert.mock.contexts[0]).toBe(tui);
        if (mode === "live") await renderLive(history[2]!);
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
          const ownership = vi.spyOn(session, "getAllTools");
          const previous = original.call({ session }, name);
          expect(host.getRegisteredToolDefinition.call({ session }, name)).toEqual(previous);
          expect(ownership).toHaveBeenCalled();
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
