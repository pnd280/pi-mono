import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { observeFileMutations, type FileMutation } from "../file-mutations/index.ts";

it.each([0, 1])(
  "shares a single mutation wrapper and restores it after subscriber %s is removed last",
  async (last) => {
    const directory = await mkdtemp(join(tmpdir(), "native-tools-"));
    const manager = SessionManager.inMemory(directory);
    const originalBuild: unknown = Reflect.get(AgentSession.prototype, "_buildRuntime");
    const changes: FileMutation[][] = [[], []];
    const broken = observeFileMutations({
      eligible: () => {
        throw new Error("observer eligibility");
      },
      begin: () => undefined
    });
    const observers = changes.map((results) =>
      observeFileMutations({
        eligible: (session) => session.sessionManager === manager,
        begin: () => ({
          maxSourceBytes: 1024,
          completed: (value) => {
            results.push(value);
          }
        })
      })
    );
    let session: AgentSession | undefined;
    vi.stubEnv("PI_OFFLINE", "1");

    try {
      const settingsManager = SettingsManager.inMemory();
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
      ({ session } = await createAgentSession({
        cwd: directory,
        agentDir: directory,
        settingsManager,
        resourceLoader,
        modelRuntime,
        sessionManager: manager
      }));
      const definition = session.getToolDefinition("write");

      const execute = (content: string) => {
        const tool = session?.agent.state.tools.find((tool) => tool.name === "write");
        if (!tool) throw new Error("Missing write");

        return tool.execute(content, { path: "file", content });
      };

      await execute("first\n");
      expect(changes[0]).toHaveLength(1);
      expect(changes[0]![0]).toBe(changes[1]![0]);
      broken.dispose();
      observers[1 - last]!.dispose();
      await execute("second\n");
      expect(session.getToolDefinition("write")).toBe(definition);
      expect(changes[last]).toHaveLength(2);
      expect(changes[1 - last]).toHaveLength(1);
      observers[last]!.dispose();
      expect(session.getToolDefinition("write")).not.toBe(definition);
      expect(Reflect.get(AgentSession.prototype, "_buildRuntime")).toBe(originalBuild);
      await execute("unobserved\n");
      expect(changes[last]).toHaveLength(2);
    } finally {
      broken.dispose();
      observers.forEach((observer) => observer.dispose());
      session?.dispose();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
