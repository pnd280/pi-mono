import { mkdtemp, rm } from "node:fs/promises";
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
} from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, Text, type TUI } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vitest";

import toolDisplay from "./index.ts";
import { installReplayDisplays } from "./replay.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];
type LookupSession = Pick<AgentSession, "getAllTools"> & {
  getToolDefinition: (name: string) => RenderDefinition;
};

// Exercise the actual TUI lookup without starting a terminal or an agent turn.
const host = InteractiveMode.prototype as unknown as {
  getRegisteredToolDefinition: (this: { session: LookupSession }, name: string) => RenderDefinition;
};

function readRow(session: AgentSession): ToolExecutionComponent {
  const definition = host.getRegisteredToolDefinition.call({ session }, "read");
  const ui = { requestRender: () => {} } as TUI;
  const row = new ToolExecutionComponent(
    "read",
    "read-1",
    { path: "example.txt" },
    { showImages: false },
    definition,
    ui,
    session.sessionManager.getCwd(),
  );
  row.updateResult({
    content: [{ type: "text", text: "retained file content\n" }],
    isError: false,
  });
  return row;
}

function text(row: ToolExecutionComponent): string {
  return row.render(80).map(stripTerminalSequences).join("\n");
}

it("preserves restored rows across reloads and removes the hook when the extension is disabled", async () => {
  const originalLookup = host.getRegisteredToolDefinition;
  const extensionFactories = [toolDisplay];
  const directory = await mkdtemp(join(tmpdir(), "pi-tool-display-reload-"));
  const agentDir = join(directory, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  let session: AgentSession | undefined;
  try {
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: directory,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories,
    });
    await resourceLoader.reload();
    expect(resourceLoader.getExtensions().errors).toEqual([]);
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-store.json"),
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    const created = await createAgentSession({
      cwd: directory,
      agentDir,
      settingsManager,
      resourceLoader,
      modelRuntime,
      sessionManager: SessionManager.inMemory(directory),
    });
    session = created.session;
    const current = session;
    const errors: unknown[] = [];
    initTheme("dark", false);
    await current.bindExtensions({
      mode: "tui",
      onError: (error) => {
        errors.push(error);
      },
    });
    const activeNames = current.getActiveToolNames();
    expect(text(readRow(current))).toContain("• Read example.txt");

    for (let reload = 0; reload < 2; reload++) {
      let restored: ToolExecutionComponent | undefined;
      await current.reload({
        beforeSessionStart: () => {
          const original = current.getToolDefinition("read");
          restored = readRow(current);
          expect(current.getToolDefinition("read")).toBe(original);
          expect(
            current.getAllTools().find((tool) => tool.name === "read")?.sourceInfo.source,
          ).toBe("builtin");
        },
      });
      if (!restored) throw new Error("Expected transcript restoration during reload");
      restored.invalidate();
      expect(text(restored)).toContain("• Read example.txt");
      expect(text(restored)).not.toContain("retained file content");
      restored.setExpanded(true);
      expect(text(restored)).toContain("retained file content");
      expect(text(readRow(current))).toContain("• Read example.txt");
      expect(current.getActiveToolNames()).toEqual(activeNames);
      expect(errors).toEqual([]);
    }

    extensionFactories.length = 0;
    await current.reload();
    expect(host.getRegisteredToolDefinition).toBe(originalLookup);
    expect(text(readRow(current))).not.toContain("• Read example.txt");
  } finally {
    await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it("decorates only built-in rendering without replacing execution or other owners' renderers", () => {
  const dispose = installReplayDisplays();
  try {
    const definition = {
      ...createReadToolDefinition("/tmp"),
      renderCall: () => new Text("owner display"),
    };
    for (const source of ["builtin", "remote-extension", "sdk"]) {
      const session = {
        getToolDefinition: () => definition,
        getAllTools: () => [
          { ...definition, sourceInfo: createSyntheticSourceInfo("read", { source }) },
        ],
      };
      const resolved = host.getRegisteredToolDefinition.call({ session }, "read");
      if (!resolved || !("execute" in resolved)) throw new Error("Expected execution definition");
      expect(resolved.execute === definition.execute).toBe(true);
      expect(resolved.parameters).toBe(definition.parameters);
      if (source === "builtin") {
        expect(resolved.renderShell).toBe("self");
        expect(resolved.renderCall).not.toBe(definition.renderCall);
      } else {
        expect(resolved.renderCall).toBe(definition.renderCall);
        expect(resolved.renderShell).toBeUndefined();
      }
    }
  } finally {
    dispose?.();
  }
});

it("replaces previous installations and preserves later wrappers when disposed", () => {
  const original = host.getRegisteredToolDefinition;
  const firstDispose = installReplayDisplays();
  const secondDispose = installReplayDisplays();
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

    const definition = createReadToolDefinition("/tmp");
    const session = {
      getToolDefinition: () => definition,
      getAllTools: () => [
        { ...definition, sourceInfo: createSyntheticSourceInfo("read", { source: "builtin" }) },
      ],
    };
    expect(host.getRegisteredToolDefinition.call({ session }, "read")?.renderShell).not.toBe(
      "self",
    );
  } finally {
    secondDispose?.();
    host.getRegisteredToolDefinition = original;
  }
});
