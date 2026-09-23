import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type AgentSession,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  SessionManager,
  SettingsManager
} from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import piSessionUtils from "../index.ts";

it("persists an ephemeral conversation, then creates an empty child through Pi", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pi-session-utils-host-"));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  mkdirSync(cwd);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  let cancelNew = false;

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: sessionCwd,
    sessionManager,
    sessionStartEvent
  }) => {
    const services = await createAgentSessionServices({
      cwd: sessionCwd,
      agentDir,
      settingsManager: SettingsManager.inMemory(),
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noThemes: true,
        noContextFiles: true,
        noPromptTemplates: true,
        extensionFactories: [
          piSessionUtils,
          (pi) => {
            pi.on("session_before_switch", (event) => {
              if (event.reason === "new" && cancelNew) return { cancel: true };
            });
          }
        ]
      }
    });

    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        ...(sessionStartEvent ? { sessionStartEvent } : {}),
        noTools: "all"
      })),
      services,
      diagnostics: services.diagnostics
    };
  };

  let runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>> | undefined;

  try {
    runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir,
      sessionManager: SessionManager.inMemory(cwd)
    });

    const bind = async (session: AgentSession) => {
      await session.bindExtensions({
        mode: "print",
        commandContextActions: {
          waitForIdle: () => session.waitForIdle(),
          switchSession: (path, options) => runtime!.switchSession(path, options),
          newSession: (options) => runtime!.newSession(options),
          fork: (id, options) => runtime!.fork(id, options),
          navigateTree: async () => ({ cancelled: false }),
          reload: async () => {}
        }
      });
    };

    runtime.setRebindSession(bind);
    await bind(runtime.session);
    runtime.session.sessionManager.appendMessage({
      role: "user",
      content: "ephemeral conversation",
      timestamp: Date.now()
    });

    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session.sessionFile).toBeUndefined();
    await runtime.session.prompt("/sesh persist");

    const path = runtime.session.sessionFile;
    expect(path).toBeDefined();
    expect(existsSync(path!)).toBe(true);
    expect(runtime.session.sessionManager.isPersisted()).toBe(true);
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
    cancelNew = true;
    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session).toBe(parentSession);
    cancelNew = false;
    await runtime.session.prompt("/sesh create-empty-child");
    expect(runtime.session).not.toBe(parentSession);
    expect(runtime.session.sessionManager.getHeader()?.parentSession).toBe(path);
    expect(runtime.session.sessionManager.buildSessionContext().messages).toEqual([]);
    expect(runtime.session.sessionFile).not.toBe(path);
    expect(SessionManager.open(path!).getEntries()).toEqual(parentEntries);
  } finally {
    await runtime?.dispose();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
});
