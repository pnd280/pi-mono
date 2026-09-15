import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import promptManager from "../index.ts";
import { workspace } from "../src/test-fixture.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllEnvs();
});

async function host(mode: ExtensionContext["mode"], before?: (pi: ExtensionAPI) => void) {
  const fixture = await workspace();
  // Remove storage made by the test helper so mode guards can prove no feature I/O.
  await rm(join(fixture.agentDir, "pi-prompt-manager"), { recursive: true });
  vi.stubEnv("PI_CODING_AGENT_DIR", fixture.agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  const registrations: string[] = [];
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
        const command = pi.registerCommand.bind(pi);

        pi.registerCommand = (name, options) => {
          registrations.push(name);
          command(name, options);
        };

        const shortcut = pi.registerShortcut.bind(pi);

        pi.registerShortcut = (key, options) => {
          registrations.push(key);
          shortcut(key, options);
        };

        promptManager(pi);
      }
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  expect(registrations).toEqual([]);
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
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(fixture.directory, { recursive: true, force: true });
  });
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

  return { ...fixture, session, registrations, errors, notify, getEditor: () => editor };
}

it.each(["print", "json", "rpc"] as const)(
  "does not register or touch feature storage/settings in %s mode",
  async (mode) => {
    const fixture = await host(mode);
    expect(fixture.registrations).toEqual([]);
    expect(fixture.session.extensionRunner.getCommand("prompts")).toBeUndefined();
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
  expect(fixture.registrations).toEqual(["prompts", "ctrl+r", "ctrl+shift+s"]);
  const runner = fixture.session.extensionRunner;
  const oldCommand = runner.getCommand("prompts")!;
  const oldContext = runner.createCommandContext();
  await oldCommand.handler("save", oldContext);
  expect(fixture.getEditor()).toBe("");
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
  });
  expect([...runner.getShortcuts({}).keys()]).toEqual(["ctrl+r", "ctrl+shift+s"]);
  expect(fixture.session.sessionManager.isPersisted()).toBe(false);
  await fixture.session.reload();
  expect(fixture.registrations).toHaveLength(6);
  await oldCommand.handler("drafts add stale", oldContext);
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
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
  sm.appendCustomMessageEntry("fixture", "hidden context", false);
  await runner.emitInput("extension after hidden context", undefined, "extension");
  await runner.emitInput("steering", undefined, "interactive", "steer");
  sm.appendCustomMessageEntry(
    "fixture",
    [
      { type: "text", text: "block one" },
      { type: "text", text: "block two" }
    ],
    true
  );
  await runner.emitInput("extension after visible context", undefined, "extension");
  sm.appendSessionInfo("metadata");
  await runner.emitInput("extension after metadata", undefined, "extension");
  await runner.emitInput("rpc input", undefined, "rpc");
  await runner.emitInput("follow-up", undefined, "interactive", "followUp");
  const expected = ["follow-up", "steering", "after"];
  await vi.waitFor(async () => {
    const history = await fixture.repository.read("history");
    expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual(
      expected
    );
  });
  await fixture.session.reload();
  const history = await fixture.repository.read("history");
  expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual(
    expected
  );
  expect(fixture.errors).toEqual([]);
});
