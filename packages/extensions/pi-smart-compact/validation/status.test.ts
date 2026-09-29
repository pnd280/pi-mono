import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  initTheme,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionRuntime,
  type BoundaryResult,
  type ExtensionAPI
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { it, vi } from "vite-plus/test";

import smartCompact from "../index.ts";
import { compactionStatusKey } from "../src/status.ts";

it.each([
  { boundary: "turn_end", mode: "tui" },
  { boundary: "agent_before_settle", mode: "rpc" }
] as const)("refreshes compaction status through $boundary ($mode)", async ({ boundary, mode }) => {
  const directory = await createValidationWorkspace("pi-compact-status-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  const statuses = new Map<string, string>([["other-extension", "untouched"]]);
  const errors: unknown[] = [];
  let runtime: AgentSessionRuntime | undefined;
  let cancel = false;
  let proposed = false;
  const requestStatuses: (string | undefined)[] = [];
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  initTheme("dark");

  try {
    const faux = fauxProvider({ provider: "status-fixture", models: [{ id: "main" }] });

    const checkStatus = (count: number) => {
      assert.ok(runtime);
      const theme = runtime.session.extensionRunner.createContext().ui.theme;
      assert.equal(
        statuses.get(compactionStatusKey),
        count === 0 ? undefined : theme.fg("dim", `compacted ${count}×`)
      );
    };

    faux.setResponses(
      Array.from({ length: 2 }, () => () => {
        requestStatuses.push(statuses.get(compactionStatusKey));

        return fauxAssistantMessage("Finished work.");
      })
    );

    const fixture = (pi: ExtensionAPI) => {
      pi.registerProvider(faux.provider);
      pi.on("session_before_compact", (event) =>
        cancel
          ? { cancel: true }
          : {
              compaction: {
                summary: "Hook summary",
                firstKeptEntryId: event.preparation.firstKeptEntryId,
                tokensBefore: event.preparation.tokensBefore
              }
            }
      );

      const propose = (): BoundaryResult | undefined => {
        if (proposed) return;
        proposed = true;

        return {
          entries: [{ type: "compaction", summary: "Boundary summary", firstKeptEntryId: null }],
          continue: boundary === "turn_end"
        };
      };

      if (boundary === "turn_end") pi.on("turn_end", propose);
      else pi.on("agent_before_settle", propose);
    };

    const manager = SessionManager.inMemory(cwd);
    const root = manager.appendMessage({ role: "user", content: "Original task", timestamp: 1 });
    manager.appendCompaction("Restored summary", null, 100);
    runtime = await createAgentSessionRuntime(
      async ({ cwd: sessionCwd, sessionManager, sessionStartEvent }) => {
        const services = await createAgentSessionServices({
          cwd: sessionCwd,
          agentDir,
          settingsManager: SettingsManager.inMemory({
            defaultProvider: "status-fixture",
            defaultModel: "main",
            compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 },
            retry: { enabled: false }
          }),
          resourceLoaderOptions: {
            noExtensions: true,
            noSkills: true,
            noThemes: true,
            noContextFiles: true,
            noPromptTemplates: true,
            extensionFactories: [smartCompact, fixture]
          }
        });

        return {
          ...(await createAgentSessionFromServices({
            services,
            sessionManager,
            model: faux.getModel(),
            ...(sessionStartEvent ? { sessionStartEvent } : {})
          })),
          services,
          diagnostics: services.diagnostics
        };
      },
      { cwd, agentDir, sessionManager: manager }
    );

    const bind = async (session: AgentSession) => {
      await session.bindExtensions({
        mode,
        uiContext: {
          ...session.extensionRunner.createContext().ui,
          setStatus(key, text) {
            if (text === undefined) statuses.delete(key);
            else statuses.set(key, text);
          }
        },
        onError: (error) => errors.push(error)
      });
    };

    runtime.setRebindSession(bind);
    await bind(runtime.session);
    checkStatus(1);
    const session = runtime.session;

    const seed = () => {
      manager.appendMessage({ role: "user", content: "Old work ".repeat(1000), timestamp: 2 });
      manager.appendMessage(fauxAssistantMessage("Done."));
      manager.appendMessage({ role: "user", content: "Next task ".repeat(200), timestamp: 3 });
    };

    seed();
    await session.compact();
    checkStatus(2);
    seed();
    cancel = true;
    await assert.rejects(session.compact(), /cancelled/);
    checkStatus(2);

    await session.prompt("Finish the task.");
    checkStatus(3);
    assert.equal(requestStatuses.length, boundary === "turn_end" ? 2 : 1);
    if (boundary === "turn_end")
      assert.equal(
        requestStatuses[1],
        session.extensionRunner.createContext().ui.theme.fg("dim", "compacted 3×")
      );
    const leaf = manager.getLeafId();
    assert.ok(leaf);
    await session.navigateTree(root);
    checkStatus(0);
    await session.navigateTree(leaf);
    checkStatus(3);
    await session.reload();
    checkStatus(3);
    await runtime.newSession();
    checkStatus(0);
    runtime.session.sessionManager.appendCompaction("Shutdown summary", null, 100);
    await runtime.session.reload();
    checkStatus(1);
    await runtime.dispose();
    assert.deepEqual([...statuses], [["other-extension", "untouched"]]);
    assert.deepEqual(errors, []);
  } finally {
    await runtime?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
