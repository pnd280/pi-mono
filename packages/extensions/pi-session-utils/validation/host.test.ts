import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  type AgentSession,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
  SettingsManager
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import piSessionUtils from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllEnvs();
});

async function host(settings: string) {
  const directory = await createValidationWorkspace("pi-session-utils-host-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  writeFileSync(join(agentDir, "settings.json"), settings);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const state = { cancelNew: false };
  const faux = fauxProvider({
    provider: "title-fixture",
    models: [{ id: "active" }, { id: "title" }]
  });
  const errors: unknown[] = [];
  cleanups.push(async () => {
    rmSync(directory, { recursive: true, force: true });
  });

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: sessionCwd,
    sessionManager,
    sessionStartEvent
  }) => {
    const services = await createAgentSessionServices({
      cwd: sessionCwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({
        defaultProvider: "title-fixture",
        defaultModel: "active",
        defaultThinkingLevel: "off",
        compaction: { enabled: false },
        retry: { enabled: false }
      }),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noThemes: true,
        noContextFiles: true,
        noPromptTemplates: true,
        extensionFactories: [
          piSessionUtils,
          (pi) => {
            pi.registerProvider(faux.provider);
            pi.on("session_before_switch", (event) => {
              if (event.reason === "new" && state.cancelNew) return { cancel: true };
            });
          }
        ]
      }
    });

    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        model: faux.getModel("active")!,
        thinkingLevel: "off",
        ...(sessionStartEvent ? { sessionStartEvent } : {}),
        noTools: "all"
      })),
      services,
      diagnostics: services.diagnostics
    };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager: SessionManager.inMemory(cwd)
  });
  cleanups.unshift(async () => {
    await runtime.dispose();
  });

  const bind = async (session: AgentSession) => {
    await session.bindExtensions({
      mode: "print",
      onError: (error) => {
        errors.push(error);
      },
      commandContextActions: {
        waitForIdle: () => session.waitForIdle(),
        switchSession: (path, options) => runtime.switchSession(path, options),
        newSession: (options) => runtime.newSession(options),
        fork: (id, options) => runtime.fork(id, options),
        navigateTree: async () => ({ cancelled: false }),
        reload: async () => {}
      }
    });
  };

  runtime.setRebindSession(bind);
  await bind(runtime.session);

  return { runtime, faux, state, errors };
}

it.each(["{}", '{"ext.pi-session-utils":{"auto-title":{"model":null}}}'])(
  "persists then creates an empty child without valid naming settings: %s",
  async (settings) => {
    const { runtime, faux, state, errors } = await host(settings);
    const stream = vi.spyOn(faux.provider, "streamSimple");
    runtime.session.sessionManager.appendMessage({
      role: "user",
      content: "ephemeral conversation",
      timestamp: Date.now()
    });
    runtime.session.setSessionName("Parent name");
    await runtime.session.prompt("/sesh auto-name");
    expect(runtime.session.sessionManager.getSessionName()).toBe("Parent name");

    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session.sessionFile).toBeUndefined();
    await runtime.session.prompt("/sesh persist");

    const path = runtime.session.sessionFile;
    expect(path).toBeDefined();
    expect(existsSync(path!)).toBe(true);
    expect(runtime.session.sessionManager.isPersisted()).toBe(true);
    expect(runtime.session.sessionManager.getSessionName()).toBe("Parent name");
    expect(SessionManager.open(path!).buildSessionContext().messages).toEqual(
      runtime.session.sessionManager.buildSessionContext().messages
    );
    runtime.session.sessionManager.appendMessage({
      role: "user",
      content: "continued after switching",
      timestamp: Date.now()
    });
    expect(SessionManager.open(path!).getBranch()).toEqual(
      runtime.session.sessionManager.getBranch()
    );

    const parentEntries = SessionManager.open(path!).getEntries();
    const parentSession = runtime.session;
    state.cancelNew = true;
    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session).toBe(parentSession);
    state.cancelNew = false;
    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session).not.toBe(parentSession);
    expect(runtime.session.sessionManager.getHeader()?.parentSession).toBe(path);
    expect(runtime.session.sessionManager.buildSessionContext().messages).toEqual([]);
    expect(runtime.session.sessionManager.getSessionName()).toBeUndefined();
    expect(runtime.session.sessionFile).not.toBe(path);
    expect(SessionManager.open(path!).getEntries()).toEqual(parentEntries);
    expect(stream).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  }
);

it("cancels naming across persistence and child creation, preserving only the parent's existing name", async () => {
  const { runtime, faux, errors } = await host(
    JSON.stringify({
      "ext.pi-session-utils": {
        "auto-title": { model: "title-fixture/title", thinkingLevel: "off" }
      }
    })
  );
  runtime.session.sessionManager.appendMessage({
    role: "user",
    content: "Parent request",
    timestamp: Date.now()
  });
  runtime.session.setSessionName("Parent name");
  const stream = vi.spyOn(faux.provider, "streamSimple");
  const first = Promise.withResolvers<ReturnType<typeof fauxAssistantMessage>>();
  faux.setResponses([() => first.promise]);
  const pendingPersistTitle = runtime.session.prompt("/sesh auto-name");
  await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
  await runtime.session.prompt("/sesh persist");
  await pendingPersistTitle;
  expect(stream.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  const parentPath = runtime.session.sessionFile!;
  first.resolve(fauxAssistantMessage("Stale ephemeral title"));
  expect(runtime.session.sessionManager.getSessionName()).toBe("Parent name");
  expect(SessionManager.open(parentPath).getSessionName()).toBe("Parent name");

  const second = Promise.withResolvers<ReturnType<typeof fauxAssistantMessage>>();
  faux.setResponses([() => second.promise]);
  const pendingParentTitle = runtime.session.prompt("/sesh auto-name");
  await vi.waitFor(() => expect(stream).toHaveBeenCalledTimes(2));
  await runtime.session.prompt("/sesh create-empty-child");
  await pendingParentTitle;
  expect(stream.mock.calls[1]?.[2]?.signal?.aborted).toBe(true);
  second.resolve(fauxAssistantMessage("Stale parent title"));
  expect(runtime.session.sessionManager.getSessionName()).toBeUndefined();
  expect(runtime.session.sessionManager.getHeader()?.parentSession).toBe(parentPath);
  expect(runtime.session.sessionManager.buildSessionContext().messages).toEqual([]);

  faux.setResponses(
    Array.from(
      { length: 2 },
      () => (_context, _options, _state, model) =>
        fauxAssistantMessage(model.id === "title" ? "Child title" : "Child reply")
    )
  );
  await runtime.session.prompt("Child request");
  await vi.waitFor(() =>
    expect(runtime.session.sessionManager.getSessionName()).toBe("Child title")
  );
  const childTitleRequest = stream.mock.calls.find(
    ([model, context]) =>
      model.id === "title" &&
      context.messages.some(({ role, content }) => role === "user" && content === "Child request")
  );
  expect(childTitleRequest).toBeDefined();
  expect(SessionManager.open(parentPath).getSessionName()).toBe("Parent name");
  expect(errors).toEqual([]);
});
