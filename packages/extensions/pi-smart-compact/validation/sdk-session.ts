import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { expect, vi } from "vite-plus/test";

/** Real SDK session for routing and tool policy, without an interactive host. */
export async function sdkSessionFixture(factories: ((pi: ExtensionAPI) => void)[]) {
  const directory = await createValidationWorkspace("pi-smart-compact-sdk-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  let session: AgentSession | undefined;
  const errors: unknown[] = [];

  const dispose = async () => {
    try {
      await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    } finally {
      session?.dispose();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }

    expect(errors).toEqual([]);
  };

  try {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      modelRuntime: await ModelRuntime.create({
        authPath: join(agentDir, "auth.json"),
        modelsPath: null,
        modelsStorePath: join(agentDir, "models-store.json"),
        refreshOnCreate: false,
        allowModelNetwork: false
      }),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: false }
      }),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noThemes: true,
        noContextFiles: true,
        noPromptTemplates: true,
        extensionFactories: factories
      }
    });
    ({ session } = await createAgentSessionFromServices({
      services,
      sessionManager: SessionManager.inMemory(cwd)
    }));
    const activeSession = session;

    return {
      session: activeSession,
      agentDir,
      async bind() {
        await activeSession.bindExtensions({
          mode: "print",
          onError: (error) => errors.push(error)
        });
        expect(errors).toEqual([]);
      },
      dispose
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
