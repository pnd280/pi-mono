import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import promptManager from "../index.ts";
import { workspace } from "../src/test-fixture.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  } finally {
    vi.unstubAllEnvs();
  }
});

async function host(mode: ExtensionContext["mode"], before?: (pi: ExtensionAPI) => void) {
  const fixture = await workspace();
  const resources: { session?: AgentSession } = {};
  cleanups.push(async () => {
    try {
      await resources.session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    } finally {
      try {
        resources.session?.dispose();
      } finally {
        await rm(fixture.directory, { recursive: true, force: true });
      }
    }
  });
  // Remove storage made by the test helper so mode guards can prove no feature I/O.
  await rm(join(fixture.agentDir, "pi-prompt-manager"), { recursive: true });
  if (mode !== "tui")
    await writeFile(
      join(fixture.agentDir, "settings.json"),
      JSON.stringify({ "ext.pi-prompt-manager": { historyRetention: "invalid" } })
    );
  vi.stubEnv("PI_CODING_AGENT_DIR", fixture.agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    extensionFactories: [
      (pi) => {
        before?.(pi);
        promptManager(pi);
      }
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(fixture.agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(fixture.agentDir, "models-store.json"),
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  const { session } = await createAgentSession({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    sessionManager: SessionManager.inMemory(fixture.cwd),
    noTools: "all"
  });
  resources.session = session;
  let editor = "exact draft";
  const notify = vi.fn();
  const ui = {
    ...session.extensionRunner.createContext().ui,
    getEditorText: () => editor,
    setEditorText: (text: string) => {
      editor = text;
    },
    notify
  };
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode,
    uiContext: ui,
    onError: (error) => {
      errors.push(error);
    }
  });

  return { ...fixture, session, errors, notify, getEditor: () => editor };
}

it.each(["print", "rpc"] as const)(
  "does not register or touch feature storage/settings in %s mode",
  async (mode) => {
    const fixture = await host(mode);
    expect(fixture.session.extensionRunner.getCommand("prompts")).toBeUndefined();
    expect(fixture.session.extensionRunner.getShortcuts({}).has("ctrl+r")).toBe(false);
    await fixture.session.extensionRunner.emitInput("not captured", undefined, "interactive");
    fixture.session.sessionManager.appendCustomMessageEntry("fixture", "not captured", false);
    await expect(readFile(join(fixture.agentDir, "pi-prompt-manager"))).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(fixture.notify).not.toHaveBeenCalled();
    expect(fixture.errors).toEqual([]);
  }
);

it("registers at startup and reload, keeps old callbacks inert, persists without native session storage", async () => {
  const fixture = await host("tui");
  const runner = fixture.session.extensionRunner;
  const oldCommand = runner.getCommand("prompts")!;
  const oldContext = runner.createCommandContext();
  await oldCommand.handler("save", oldContext);
  expect(fixture.getEditor()).toBe("");
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
  });
  expect(runner.getShortcuts({}).has("ctrl+r")).toBe(true);
  expect(runner.getShortcuts({}).has("ctrl+shift+s")).toBe(true);
  await fixture.session.reload();
  await oldCommand.handler("drafts add stale", oldContext);
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
  });
  const currentRunner = fixture.session.extensionRunner;
  const currentCommand = currentRunner.getCommand("prompts");
  expect(currentCommand).toBeDefined();
  await currentCommand!.handler("drafts add current", currentRunner.createCommandContext());
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "current" } }, { source: { text: "exact draft" } }]
  });
  expect(fixture.errors).toEqual([]);
});

it("captures only interactive input after transforms, without replay across reloads", async () => {
  const fixture = await host("tui", (pi) =>
    pi.on("input", (event) =>
      event.text === "before" ? { action: "transform", text: "after" } : undefined
    )
  );
  const runner = fixture.session.extensionRunner;
  const sm = fixture.session.sessionManager;
  sm.appendMessage({ role: "user", content: "existing user message", timestamp: Date.now() });
  await runner.emitInput("extension input", undefined, "extension");
  await runner.emitInput("before", undefined, "interactive");
  await runner.emitInput("steering", undefined, "interactive", "steer");
  await runner.emitInput("rpc input", undefined, "rpc");
  await runner.emitInput("follow-up", undefined, "interactive", "followUp");
  const expected = ["follow-up", "steering", "after"];
  await vi.waitFor(
    async () => {
      const history = await fixture.repository.read("history");
      expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual(
        expected
      );
    },
    { timeout: STEP_TIMEOUT_MS }
  );
  await fixture.session.reload();
  const history = await fixture.repository.read("history");
  expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual(
    expected
  );
  expect(fixture.errors).toEqual([]);
});
