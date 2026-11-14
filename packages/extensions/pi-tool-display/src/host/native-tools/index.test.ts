import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { observeNativeTools } from "./index.ts";

async function createSession(directory: string, manager: SessionManager): Promise<AgentSession> {
  const settingsManager = SettingsManager.create(directory, directory);
  const resourceLoader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: directory,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true
  });
  await resourceLoader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: join(directory, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(directory, "models-store.json"),
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  const { session } = await createAgentSession({
    cwd: directory,
    agentDir: directory,
    settingsManager,
    resourceLoader,
    modelRuntime,
    sessionManager: manager
  });

  return session;
}

it("shares wrappers through default-tool reloads and restores after the last subscriber is removed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-tools-"));
  const manager = SessionManager.inMemory(directory);
  const readCalls: string[] = [];
  const readObserver = {
    names: ["read"],
    eligible: (candidate: AgentSession) => candidate.sessionManager === manager,
    wrap: (_session: AgentSession, original: ToolDefinition) => ({
      ...original,
      execute(...args: Parameters<typeof original.execute>) {
        readCalls.push("observed");

        return original.execute(...args);
      }
    })
  };
  const firstRead = observeNativeTools(readObserver);
  const secondRead = observeNativeTools(readObserver);
  let session: AgentSession | undefined;
  vi.stubEnv("PI_OFFLINE", "1");

  try {
    await writeFile(join(directory, "file"), "first\n");
    session = await createSession(directory, manager);

    const read = () => {
      const tool = session?.agent.state.tools.find((tool) => tool.name === "read");
      if (!tool) throw new Error("Missing read");

      return tool.execute("read", { path: "file" });
    };

    const retainedRead = session.agent.state.tools.find((tool) => tool.name === "read");
    if (!retainedRead) throw new Error("Missing read");

    await read();
    expect(readCalls).toHaveLength(1);
    firstRead.dispose();
    await retainedRead.execute("old-read", { path: "file" });
    expect(readCalls).toHaveLength(1);
    await read();
    expect(readCalls).toHaveLength(2);

    await session.bindExtensions({});

    for (const defaultTools of [["read", "grep"], ["read"]]) {
      await writeFile(join(directory, "settings.json"), JSON.stringify({ defaultTools }));
      await session.reload();
      expect(session.getActiveToolNames()).toEqual(
        expect.arrayContaining(["read", "bash", "edit", "write", "grep"])
      );
      const before = readCalls.length;
      await read();
      expect(readCalls).toHaveLength(before + 1);
    }

    secondRead.dispose();
    const observed = readCalls.length;
    await read();
    expect(readCalls).toHaveLength(observed);
  } finally {
    firstRead.dispose();
    secondRead.dispose();
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

it("deactivates subscribers disposed by another callback during dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-tools-disposal-"));
  const manager = SessionManager.inMemory(directory);
  const eligible = (candidate: AgentSession) => candidate.sessionManager === manager;
  let retireNative: (() => void) | undefined;
  const firstNative = observeNativeTools({
    names: ["read"],
    eligible() {
      const retire = retireNative;
      retireNative = undefined;
      retire?.();

      return false;
    },
    wrap: (_session, original) => original
  });
  const retiredEligible = vi.fn(eligible);
  const retiredWrap = vi.fn((_session: AgentSession, original: ToolDefinition) => original);
  const retiredNative = observeNativeTools({
    names: ["read"],
    eligible: retiredEligible,
    wrap: retiredWrap
  });
  const reads = vi.fn();
  const survivingNative = observeNativeTools({
    names: ["read"],
    eligible,
    wrap: (_session, original) => ({
      ...original,
      execute(...args) {
        reads();

        return original.execute(...args);
      }
    })
  });
  let session: AgentSession | undefined;
  vi.stubEnv("PI_OFFLINE", "1");

  try {
    await writeFile(join(directory, "file"), "written\n");
    session = await createSession(directory, manager);
    retireNative = () => retiredNative.dispose();
    retiredEligible.mockClear();
    retiredWrap.mockClear();
    firstNative.bind(session);
    expect(retiredEligible.mock.calls.length).toBe(0);
    expect(retiredWrap.mock.calls.length).toBe(0);

    const read = session.agent.state.tools.find((tool) => tool.name === "read");
    if (!read) throw new Error("Missing native read");
    await read.execute("read", { path: "file" });
    expect(reads).toHaveBeenCalledOnce();
  } finally {
    firstNative.dispose();
    retiredNative.dispose();
    survivingNative.dispose();
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
