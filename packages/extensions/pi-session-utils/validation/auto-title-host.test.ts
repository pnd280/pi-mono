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
  type AgentSession,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace, STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { expect, it, onTestFinished, vi } from "vite-plus/test";

import sessionUtils from "../index.ts";

const settings = JSON.stringify({
  theme: "light",
  "ext.pi-session-utils": {
    "auto-title": { model: "title-fixture/title", thinkingLevel: "off" }
  }
});

async function host({
  projectTrusted = false,
  projectSettings,
  ancestorSettings,
  globalSettings = settings
}: {
  projectTrusted?: boolean;
  projectSettings?: string;
  ancestorSettings?: string;
  globalSettings?: string;
} = {}) {
  const directory = await createValidationWorkspace("pi-session-utils-auto-title-host-");
  const resources: { session?: AgentSession } = {};
  onTestFinished(async () => {
    try {
      try {
        await resources.session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      } finally {
        resources.session?.dispose();
      }
    } finally {
      try {
        await rm(directory, { recursive: true, force: true });
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  const settingsPath = join(agentDir, "settings.json");
  await writeFile(settingsPath, globalSettings);

  const projectSettingsPath = join(cwd, CONFIG_DIR_NAME, "settings.json");

  if (projectSettings !== undefined) {
    await mkdir(join(cwd, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(projectSettingsPath, projectSettings);
  }

  if (ancestorSettings !== undefined) {
    await mkdir(join(directory, CONFIG_DIR_NAME), { recursive: true });
    await writeFile(join(directory, CONFIG_DIR_NAME, "settings.json"), ancestorSettings);
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
  resources.session = session;
  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode: "tui",
    uiContext: { ...session.extensionRunner.createContext().ui, notify },
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
    agentDir,
    settingsPath,
    projectSettingsPath,
    command
  };
}

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
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce(), { timeout: STEP_TIMEOUT_MS });
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
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");

  for (const args of ["unknown", "persist extra", "create-empty-child extra"]) {
    fixture.notify.mockClear();
    await handler(args, operationContext);
    expect(fixture.notify).toHaveBeenCalledExactlyOnceWith(
      "A session operation is already in progress.",
      "warning"
    );
  }

  const latest = handler("auto-name", busy);
  await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2), { timeout: STEP_TIMEOUT_MS });
  expect(stream.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  await handler(" auto-name clear ", busy);
  expect(stream.mock.calls[1]?.[2]?.signal?.aborted).toBe(true);
  await Promise.all([old, latest]);
  first.resolve(fauxAssistantMessage("Old title"));
  second.resolve(fauxAssistantMessage("Late title"));
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  // Completing naming must not release a still-pending persistence operation.
  fixture.notify.mockClear();
  const blocked = handler("persist", operationContext);
  expect(switchSession).toHaveBeenCalledOnce();
  await blocked;
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");
  replacement.resolve({ cancelled: true });
  await operation;
  expect(fixture.errors).toEqual([]);
});

it.each([
  { failure: "missing settings", globalSettings: "{}" },
  {
    failure: "invalid merged settings",
    projectTrusted: true,
    projectSettings: JSON.stringify({
      "ext.pi-session-utils": { "auto-title": { thinkingLevel: "automatic" } }
    })
  },
  {
    failure: "unavailable model",
    globalSettings: JSON.stringify({
      "ext.pi-session-utils": {
        "auto-title": { model: "missing/title", thinkingLevel: "off" }
      }
    })
  },
  {
    failure: "unsupported thinking level",
    globalSettings: JSON.stringify({
      "ext.pi-session-utils": {
        "auto-title": { model: "title-fixture/title", thinkingLevel: "low" }
      }
    })
  }
])("keeps naming inert with $failure while clear remains available", async (options) => {
  const fixture = await host(options);
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");
  await fixture.session.prompt("Opening request");
  await fixture.command();
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");
  fixture.session.setSessionName("Manual title");
  fixture.notify.mockClear();
  await fixture.command("clear");
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "info");
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
  expect(stream).toHaveBeenCalledOnce();
  expect(stream.mock.calls[0]?.[0].id).toBe("active");
  expect(fixture.titleRequests).toEqual([]);
  expect(fixture.errors).toEqual([]);
});

it.each([
  { scope: "untrusted project", projectTrusted: false, ancestor: false, selected: false },
  { scope: "trusted project", projectTrusted: true, ancestor: false, selected: true },
  { scope: "ancestor of a trusted project", projectTrusted: true, ancestor: true, selected: false }
])(
  "selects the naming provider only from global or trusted project settings: $scope",
  async ({ projectTrusted, ancestor, selected }) => {
    const projectSettings = JSON.stringify({
      "ext.pi-session-utils": { "auto-title": { model: "project-title-fixture/title" } }
    });
    const fixture = await host({
      projectTrusted,
      ...(ancestor ? { ancestorSettings: projectSettings } : { projectSettings })
    });
    const project = fauxProvider({ provider: "project-title-fixture", models: [{ id: "title" }] });
    project.setResponses([
      fauxAssistantMessage("Project session title"),
      fauxAssistantMessage("Project session title")
    ]);
    fixture.session.modelRuntime.registerNativeProvider(project.provider);
    await fixture.session.modelRuntime.refresh({ allowNetwork: false });
    const projectStream = vi.spyOn(project.provider, "streamSimple");
    await fixture.session.prompt("Opening request");
    await vi.waitFor(
      () =>
        expect(fixture.session.sessionManager.getSessionName()).toBe(
          selected ? "Project session title" : "Offline session title"
        ),
      { timeout: STEP_TIMEOUT_MS }
    );
    await fixture.command();
    expect(projectStream).toHaveBeenCalledTimes(selected ? 2 : 0);
    expect(fixture.titleRequests).toHaveLength(selected ? 0 : 2);
    if (!ancestor)
      expect(await readFile(fixture.projectSettingsPath, "utf8")).toBe(projectSettings);
    expect(fixture.errors).toEqual([]);
  }
);

it("reports naming authentication failure without exposing credential-bearing errors", async () => {
  const fixture = await host();
  await fixture.session.prompt("Opening request");
  await vi.waitFor(
    () => expect(fixture.session.sessionManager.getSessionName()).toBe("Offline session title"),
    { timeout: STEP_TIMEOUT_MS }
  );
  await fixture.command("clear");
  fixture.notify.mockClear();
  const secret = "fixture-private-credential";
  const auth = vi
    .spyOn(fixture.faux.provider.auth.apiKey!, "resolve")
    .mockRejectedValue(new Error(`Authentication failed with Bearer ${secret}`));
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");

  await fixture.command();

  expect(auth).toHaveBeenCalledOnce();
  expect(stream).not.toHaveBeenCalled();
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");
  expect(JSON.stringify(fixture.notify.mock.calls)).not.toContain(secret);
  expect(fixture.session.sessionManager.getSessionName()).toBeUndefined();
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
  await vi.waitFor(
    () => expect(fixture.session.sessionManager.getSessionName()).toBe("Project session title"),
    { timeout: STEP_TIMEOUT_MS }
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
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");
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
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce(), { timeout: STEP_TIMEOUT_MS });
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

it("cancels when tree navigation completes", async () => {
  const fixture = await host();
  const sm = fixture.session.sessionManager;
  const targetId = sm.appendMessage({ role: "user", content: "Request", timestamp: 0 });
  sm.appendMessage({ role: "user", content: "Later request", timestamp: 1 });
  const stream = vi.spyOn(fixture.faux.provider, "streamSimple");

  let finish = () => {};

  fixture.faux.setResponses([
    () =>
      new Promise((resolve) => {
        finish = () => resolve(fauxAssistantMessage("Stale branch title"));
      })
  ]);
  const pending = fixture.command();
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce(), { timeout: STEP_TIMEOUT_MS });
  expect(await fixture.session.navigateTree(targetId)).toMatchObject({ cancelled: false });
  const canceled = stream.mock.calls[0]?.[2]?.signal?.aborted;
  finish();
  await pending;
  expect(canceled).toBe(true);
  expect(sm.getSessionName()).toBeUndefined();
  expect(fixture.errors).toEqual([]);
});

it("reads settings only on load, leaves old callbacks inert, and applies fixes on /reload", async () => {
  const fixture = await host();
  await fixture.session.prompt("Opening request");
  await vi.waitFor(() => expect(fixture.titleRequests).toHaveLength(1), {
    timeout: STEP_TIMEOUT_MS
  });
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
  expect(fixture.notify).toHaveBeenCalledWith(expect.any(String), "warning");
  await writeFile(fixture.settingsPath, settings);
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(2);
  await fixture.session.reload();
  await fixture.command();
  expect(fixture.titleRequests).toHaveLength(3);
  expect(fixture.errors).toEqual([]);
});
