import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { observeFileMutations, type FileMutation, type MutationObserver } from "./index.ts";

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

it.each([0, 1])(
  "keeps surviving subscriptions observed through default-tool reloads and restores writes after subscriber %s is removed last",
  async (last) => {
    const directory = await mkdtemp(join(tmpdir(), "tool-display-mutation-subscriptions-"));
    const manager = SessionManager.inMemory(directory);
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
    const repeatedChanges: FileMutation[] = [];
    const repeatedObserver: MutationObserver = {
      eligible: (candidate: AgentSession) => candidate.sessionManager === manager,
      begin: () => ({
        maxSourceBytes: 1024,
        completed: (value) => {
          repeatedChanges.push(value);
        }
      })
    };
    const firstRepeated = observeFileMutations(repeatedObserver);
    const secondRepeated = observeFileMutations(repeatedObserver);
    let session: AgentSession | undefined;
    vi.stubEnv("PI_OFFLINE", "1");

    try {
      session = await createSession(directory, manager);

      const execute = (content: string) => {
        const tool = session?.agent.state.tools.find((tool) => tool.name === "write");
        if (!tool) throw new Error("Missing write");

        return tool.execute(content, { path: "file", content });
      };

      await execute("first\n");
      expect(repeatedChanges).toHaveLength(2);

      await session.bindExtensions({});

      for (const defaultTools of [["read", "grep"], ["read"]]) {
        await writeFile(join(directory, "settings.json"), JSON.stringify({ defaultTools }));
        await session.reload();
        expect(session.getActiveToolNames()).toEqual(
          expect.arrayContaining(["read", "bash", "edit", "write", "grep"])
        );
      }

      firstRepeated.dispose();
      await execute("repeated\n");
      expect(repeatedChanges).toHaveLength(3);
      expect(changes.map((observations) => observations.map((change) => change.after))).toEqual([
        [
          { status: "ready", text: "first\n" },
          { status: "ready", text: "repeated\n" }
        ],
        [
          { status: "ready", text: "first\n" },
          { status: "ready", text: "repeated\n" }
        ]
      ]);
      broken.dispose();
      observers[1 - last]!.dispose();
      await execute("second\n");
      expect(changes[last]!.map((change) => change.after)).toEqual([
        { status: "ready", text: "first\n" },
        { status: "ready", text: "repeated\n" },
        { status: "ready", text: "second\n" }
      ]);
      expect(changes[1 - last]).toHaveLength(2);
      secondRepeated.dispose();
      observers[last]!.dispose();
      await execute("unobserved\n");
      expect(changes[last]).toHaveLength(3);
    } finally {
      broken.dispose();
      firstRepeated.dispose();
      secondRepeated.dispose();
      observers.forEach((observer) => observer.dispose());
      session?.dispose();
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

it("deactivates subscriptions disposed by another callback during dispatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tool-display-mutation-disposal-"));
  const manager = SessionManager.inMemory(directory);
  const eligible = (candidate: AgentSession) => candidate.sessionManager === manager;
  let retireMutation: (() => void) | undefined;
  const changes: FileMutation[] = [];
  const firstMutation = observeFileMutations({
    eligible,
    begin() {
      const retire = retireMutation;
      retireMutation = undefined;
      retire?.();

      return {
        maxSourceBytes: 1024,
        completed: (mutation) => {
          changes.push(mutation);
        }
      };
    }
  });
  const retiredBegin = vi.fn(() => ({ maxSourceBytes: 1024, completed: vi.fn() }));
  const retiredMutation = observeFileMutations({ eligible, begin: retiredBegin });
  let session: AgentSession | undefined;
  vi.stubEnv("PI_OFFLINE", "1");

  try {
    session = await createSession(directory, manager);
    retireMutation = () => retiredMutation.dispose();
    const write = session.agent.state.tools.find((tool) => tool.name === "write");
    if (!write) throw new Error("Missing native write");
    await write.execute("write", { path: "file", content: "written\n" });
    expect(retiredBegin.mock.calls.length).toBe(0);
    expect(changes.map((mutation) => mutation.after)).toEqual([
      { status: "ready", text: "written\n" }
    ]);
  } finally {
    firstMutation.dispose();
    retiredMutation.dispose();
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
