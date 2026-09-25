import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider, type TranscriptContext } from "@earendil-works/pi-ai";
import {
  CONFIG_DIR_NAME,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import sessionUtils from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
const settings = JSON.stringify({
  theme: "light",
  "ext.pi-session-utils": {
    "auto-title": { model: "title-fixture/title", thinkingLevel: "off" }
  }
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllEnvs();
});

async function host({
  mode = "tui",
  projectTrusted = false,
  projectSettings,
  globalSettings = settings
}: {
  mode?: ExtensionContext["mode"];
  projectTrusted?: boolean;
  projectSettings?: string;
  globalSettings?: string;
} = {}) {
  const directory = await createValidationWorkspace("pi-session-utils-auto-title-host-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  const settingsPath = join(agentDir, "settings.json");
  await writeFile(settingsPath, globalSettings);

  const projectSettingsPath = join(cwd, CONFIG_DIR_NAME, "settings.json");

  if (projectSettings !== undefined) {
    await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(projectSettingsPath, projectSettings);
  }

  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const titleRequests: TranscriptContext[] = [];
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "title" }, { id: "project-title" }, { id: "active" }]
  });
  faux.setResponses(
    Array.from({ length: 20 }, () => (context, _options, _state, model) => {
      if (model.id !== "active") titleRequests.push(context);
      if (model.id === "project-title") return fauxAssistantMessage("Project session title");

      return fauxAssistantMessage(model.id === "title" ? "Offline session title" : "Fixture reply");
    })
  );
  const settingsManager = SettingsManager.inMemory(
    { compaction: { enabled: false }, retry: { enabled: false } },
    { projectTrusted }
  );
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    extensionFactories: [sessionUtils]
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
  modelRuntime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: faux.getModel("active")!,
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all"
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  const notify = vi.fn();
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode,
    ...(mode === "tui" || mode === "rpc"
      ? { uiContext: { ...session.extensionRunner.createContext().ui, notify } }
      : {}),
    onError: (error) => {
      errors.push(error);
    }
  });

  const command = async (args = "") => {
    const runner = session.extensionRunner;
    await runner.getCommand("sesh")!.handler(`auto-name ${args}`, runner.createCommandContext());
  };

  return {
    session,
    faux,
    titleRequests,
    notify,
    errors,
    settingsPath,
    projectSettingsPath,
    command
  };
}

it.each(["print", "rpc"] as const)(
  "names automatically and regenerates in a real %s host",
  async (mode) => {
    const fixture = await host({ mode });
    await fixture.session.prompt("Opening request");
    await vi.waitFor(() =>
      expect(fixture.session.sessionManager.getSessionName()).toBe("Offline session title")
    );
    expect(fixture.titleRequests).toHaveLength(1);
    expect(fixture.titleRequests[0]?.messages.find(({ role }) => role === "user")?.content).toBe(
      "Opening request"
    );
    expect(fixture.notify).not.toHaveBeenCalled();
    await fixture.command();
    const source = fixture.titleRequests[1]?.messages.find(({ role }) => role === "user")?.content;
    expect(source).toContain("Opening request");
    expect(source).toContain("Fixture reply");
    if (mode === "rpc") expect(fixture.notify).toHaveBeenCalled();
    else expect(fixture.notify).not.toHaveBeenCalled();
    await fixture.command("clear");
    await fixture.session.prompt("Do not automatically rename");
    expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
    expect(fixture.titleRequests).toHaveLength(2);
    expect(await readFile(fixture.settingsPath, "utf8")).toBe(settings);
    expect(fixture.errors).toEqual([]);
  }
);

it("keeps naming outside idle checks and the session-operation lock", async () => {
  const fixture = await host();
  const runner = fixture.session.extensionRunner;
  expect(runner.getCommand("auto-name")).toBeUndefined();
  const handler = runner.getCommand("sesh")!.handler;
  const ctx = runner.createCommandContext();
  const busy = { ...ctx, isIdle: () => false };
  fixture.session.sessionManager.appendMessage({ role: "user", content: "Request", timestamp: 0 });
  const first = Promise.withResolvers<ReturnType<typeof fauxAssistantMessage>>();
  const second = Promise.withResolvers<ReturnType<typeof fauxAssistantMessage>>();
  fixture.faux.setResponses([() => first.promise, () => second.promise]);
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");
  const old = handler("auto-name", busy);
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
  const replacement = Promise.withResolvers<{ cancelled: boolean }>();
  const switchSession = vi.fn<typeof ctx.switchSession>(() => replacement.promise);
  const operationContext = { ...ctx, switchSession };
  const operation = handler("persist", operationContext);
  expect(switchSession).toHaveBeenCalledOnce();
  const newSession = vi.fn<typeof ctx.newSession>();
  await handler("create-empty-child", {
    ...ctx,
    sessionManager: SessionManager.open(switchSession.mock.calls[0]![0]),
    newSession
  });
  expect(newSession).not.toHaveBeenCalled();
  expect(fixture.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");

  const latest = handler("auto-name", busy);
  await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
  expect(stream.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  await handler("auto-name clear", busy);
  expect(stream.mock.calls[1]?.[2]?.signal?.aborted).toBe(true);
  await Promise.all([old, latest]);
  first.resolve(fauxAssistantMessage("Old title"));
  second.resolve(fauxAssistantMessage("Late title"));
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  // Completing naming must not release a still-pending persistence operation.
  const blocked = handler("persist", operationContext);
  expect(switchSession).toHaveBeenCalledOnce();
  await blocked;
  expect(fixture.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  replacement.resolve({ cancelled: true });
  await operation;
  expect(fixture.errors).toEqual([]);
});

it("keeps unconfigured naming inert while clear remains available", async () => {
  const fixture = await host({ globalSettings: "{}" });
  await fixture.session.prompt("Opening request");
  expect(fixture.titleRequests).toEqual([]);
  await fixture.command();
  expect(fixture.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  fixture.session.setSessionName("Manual title");
  await fixture.command("clear");
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  expect(fixture.titleRequests).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

it("rejects unknown naming arguments without requests or changing the name", async () => {
  const fixture = await host();
  fixture.session.setSessionName("Keep this title");
  for (const args of ["extra", "clear extra"]) await fixture.command(args);
  const runner = fixture.session.extensionRunner;
  await runner.getCommand("sesh")!.handler("auto-names", runner.createCommandContext());
  expect(fixture.titleRequests).toEqual([]);
  expect(fixture.session.sessionManager.getSessionName()).toBe("Keep this title");
  expect(fixture.errors).toEqual([]);
});

it.each([false, true])("honors Pi's project trust decision: %s", async (projectTrusted) => {
  const projectSettings = JSON.stringify({
    "ext.pi-session-utils": { "auto-title": { model: "title-fixture/project-title" } }
  });
  const fixture = await host({ projectTrusted, projectSettings });
  await fixture.session.prompt("Opening request");
  await vi.waitFor(() =>
    expect(fixture.session.sessionManager.getSessionName()).toBe(
      projectTrusted ? "Project session title" : "Offline session title"
    )
  );
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  expect(await readFile(fixture.projectSettingsPath, "utf8")).toBe(projectSettings);
  expect(fixture.errors).toEqual([]);
});

it("applies project settings edits and removal only after /reload", async () => {
  const fixture = await host({
    projectTrusted: true,
    projectSettings: JSON.stringify({
      "ext.pi-session-utils": { "auto-title": { model: "title-fixture/project-title" } }
    })
  });
  await fixture.session.prompt("Opening request");
  await vi.waitFor(() =>
    expect(fixture.session.sessionManager.getSessionName()).toBe("Project session title")
  );
  await writeFile(
    fixture.projectSettingsPath,
    JSON.stringify({ "ext.pi-session-utils": { "auto-title": { model: "unavailable/title" } } })
  );
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  await fixture.session.reload();
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  expect(fixture.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  await rm(fixture.projectSettingsPath);
  await fixture.session.reload();
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(3);
  expect(fixture.session.sessionManager.getSessionName()).toBe("Offline session title");
  expect(fixture.errors).toEqual([]);
});

it("cancels when native /name changes or clears the title, even back to its original value", async () => {
  const fixture = await host();
  fixture.session.sessionManager.appendMessage({ role: "user", content: "Request", timestamp: 0 });
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");

  let finish = () => {};

  fixture.faux.setResponses([
    () =>
      new Promise((resolve) => {
        finish = () => resolve(fauxAssistantMessage("Stale title"));
      })
  ]);
  const pending = fixture.command();
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "info");
  const progress = fixture.notify.mock.calls.slice();
  fixture.session.setSessionName("Manual title");
  fixture.session.setSessionName("");
  await pending;
  finish();
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  expect(fixture.notify.mock.calls).toEqual(progress);
  expect(fixture.errors).toEqual([]);
});

it("cancels before tree navigation can wait for a branch summary", async () => {
  const fixture = await host();
  const sm = fixture.session.sessionManager;
  const targetId = sm.appendMessage({ role: "user", content: "Request", timestamp: 0 });
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");

  let finish = () => {};

  fixture.faux.setResponses([
    () =>
      new Promise((resolve) => {
        finish = () => resolve(fauxAssistantMessage("Stale branch title"));
      })
  ]);
  const pending = fixture.command();
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
  await fixture.session.extensionRunner.emit({
    type: "session_before_tree",
    preparation: {
      targetId,
      oldLeafId: sm.getLeafId(),
      commonAncestorId: targetId,
      entriesToSummarize: sm.getBranch(),
      userWantsSummary: true
    },
    signal: new AbortController().signal
  });
  const canceled = stream.mock.calls[0]?.[2]?.signal?.aborted;
  finish();
  await pending;
  expect(canceled).toBe(true);
  expect(sm.getSessionName()).toBeUndefined();
  expect(fixture.errors).toEqual([]);
});

it("does not retry a failed automatic attempt after tree navigation and names only the selected branch on demand", async () => {
  const fixture = await host();
  let failTitle = true;
  fixture.faux.setResponses(
    Array.from({ length: 5 }, () => (context, _options, _state, model) => {
      if (model.id === "active") return fauxAssistantMessage("Fixture reply");
      fixture.titleRequests.push(context);

      if (failTitle) {
        failTitle = false;

        return fauxAssistantMessage("", { stopReason: "error", errorMessage: "Fixture failure" });
      }

      return fauxAssistantMessage("Offline session title");
    })
  );
  await fixture.session.prompt("Opening request");
  await vi.waitFor(() => expect(fixture.titleRequests).toHaveLength(1));
  const sm = fixture.session.sessionManager;
  expect(sm.getSessionName()).toBeUndefined();
  const branchPoint = sm.getLeafId()!;
  await fixture.session.prompt("Abandoned follow-up");
  await fixture.session.navigateTree(branchPoint, { summarize: false });
  // An existing title would mask a wrongly replenished automatic attempt.
  expect(sm.getSessionName()).toBeUndefined();
  await fixture.session.prompt("Selected follow-up");
  expect(fixture.titleRequests).toHaveLength(1);
  expect(fixture.notify).not.toHaveBeenCalled();
  await fixture.command();
  const source = fixture.titleRequests[1]?.messages.find(({ role }) => role === "user")?.content;
  expect(source).toContain("Selected follow-up");
  expect(source).not.toContain("Abandoned follow-up");
  expect(sm.getSessionName()).toBe("Offline session title");
  expect(fixture.errors).toEqual([]);
});

it("reads settings only on load, leaves old callbacks inert, and applies fixes on /reload", async () => {
  const fixture = await host();
  await fixture.session.prompt("Opening request");
  await vi.waitFor(() => expect(fixture.titleRequests).toHaveLength(1));
  const oldRunner = fixture.session.extensionRunner;
  const oldCommand = oldRunner.getCommand("sesh")!;
  const oldContext = oldRunner.createCommandContext();
  await writeFile(fixture.settingsPath, "{}");
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  await fixture.session.reload();
  await oldCommand.handler("auto-name clear", oldContext);
  expect(fixture.session.sessionManager.getSessionName()).toBe("Offline session title");
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  expect(fixture.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  await writeFile(fixture.settingsPath, settings);
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  await fixture.session.reload();
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(3);
  expect(fixture.errors).toEqual([]);
});
