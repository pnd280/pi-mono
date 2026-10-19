import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  getCurrentSystemPrompt,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionContext,
  type InlineExtension
} from "@earendil-works/pi-coding-agent";
import { expect, onTestFinished, vi } from "vite-plus/test";

/** Both orders in which Pi can load two participants. */
export const loadOrders: ["a" | "b", "a" | "b"][] = [
  ["a", "b"],
  ["b", "a"]
];

/** Rank order (`b`, `a`) is opposite to ID order, so an order by ID or by load fails a row. */
export const ranks = { a: 200, b: 100 };

export type ProviderRequest = { systemPrompt: string; userText: string };

/**
 * An offline SDK session that loads `extensions` in order and binds them with a UI, so
 * coordinator warnings reach `notify`. Records what each provider request contains.
 */
export async function coordinationHost(
  extensions: InlineExtension[],
  options: { appendSystemPrompt?: string } = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "libs-coordination-"));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(cwd);
  await mkdir(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    ...(options.appendSystemPrompt === undefined
      ? {}
      : { appendSystemPrompt: [options.appendSystemPrompt] }),
    extensionFactories: extensions
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);

  const requests: ProviderRequest[] = [];
  const faux = fauxProvider({ provider: "faux", models: [{ id: "test" }] });
  faux.setResponses(
    Array.from({ length: 4 }, (): FauxResponseFactory => (context) => {
      const user = context.messages.filter((message) => message.role === "user").at(-1);
      const content = user?.content ?? "";
      requests.push({
        systemPrompt: getCurrentSystemPrompt(context.messages),
        userText:
          typeof content === "string"
            ? content
            : content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
      });

      return fauxAssistantMessage("Offline response");
    })
  );
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
    model: faux.models[0],
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all"
  });
  onTestFinished(() => {
    session.dispose();
  });

  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
  const errors: unknown[] = [];
  const ui = { ...session.extensionRunner.createContext().ui, notify };
  /** Emits `session_start`, then `resources_discover`, as Pi does on each bind. */
  const bind = () =>
    session.bindExtensions({
      mode: "rpc",
      uiContext: ui,
      onError: (error) => {
        errors.push(error);
      }
    });
  await bind();

  return { session, requests, notify, errors, bind };
}
