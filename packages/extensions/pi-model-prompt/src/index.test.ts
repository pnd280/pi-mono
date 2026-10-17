import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import modelPrompt from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

/** Pi's prompt section for the append text, as the model receives it. */
const addendum = (text: string) => `<addendum>\n${text}\n</addendum>`;
const claudeAddendum = addendum("BASE-APPEND\n\nANT-APPEND\n\nSHARED-APPEND");

async function host({
  cliAppend,
  earlierAppend,
  projectFiles = {},
  projectTrusted = false,
  rules = [{ match: "^faux/claude-", append: ["ant.md", "shared.md"] }]
}: {
  cliAppend?: string;
  earlierAppend?: string;
  projectFiles?: Record<string, string>;
  projectTrusted?: boolean;
  rules?: unknown[];
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pi-model-prompt-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);

  for (const [name, text] of Object.entries(projectFiles)) {
    await writeFile(join(cwd, ".pi", name), text);
  }

  const write = (name: string, text: string) => writeFile(join(agentDir, name), text);
  await write("APPEND_SYSTEM.md", "BASE-APPEND");
  await write("ant.md", "\uFEFFANT-APPEND");
  await write("shared.md", "SHARED-APPEND");
  await write("fallback.md", "FALLBACK-APPEND");
  await write("settings.json", JSON.stringify({ "ext.pi-model-prompt": { rules } }));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  settingsManager.setProjectTrusted(projectTrusted);
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    ...(cliAppend === undefined ? {} : { appendSystemPrompt: [cliAppend] }),
    extensionFactories: [
      (pi) => {
        pi.on("before_agent_start", (event) => {
          if (earlierAppend !== undefined)
            event.systemPromptOptions.appendSystemPrompt = earlierAppend;
        });
      },
      modelPrompt
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);

  const requests: string[] = [];
  const faux = fauxProvider({
    provider: "faux",
    models: [{ id: "claude-test" }, { id: "gpt-test" }]
  });
  faux.setResponses(
    Array.from({ length: 10 }, (): FauxResponseFactory => (context) => {
      requests.push(getCurrentSystemPrompt(context.messages));

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
  const [claude, gpt] = faux.models;
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: claude,
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all"
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  });
  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode: "rpc",
    uiContext: { ...session.extensionRunner.createContext().ui, notify },
    onError: (error) => {
      errors.push(error);
    }
  });

  return { session, requests, notify, errors, write, agentDir, claude, gpt: gpt! };
}

it("selects each model's first append rule from the session snapshot and sanitises file warnings", async () => {
  const fixture = await host({
    rules: [
      { match: "^faux/claude-" },
      { match: "^faux/claude-", append: ["ant.md", "shared.md"] },
      { match: "^faux/gpt-", append: [] },
      { match: ".", append: ["fallback.md"] }
    ]
  });

  await fixture.session.prompt("claude");
  expect(fixture.requests[0]).toContain(claudeAddendum);

  await fixture.session.setModel(fixture.gpt);
  await fixture.session.prompt("gpt");
  expect(fixture.requests[1]).toContain(addendum("BASE-APPEND"));

  await fixture.write("ant.md", "ANT-RELOADED");
  await fixture.write(
    "settings.json",
    JSON.stringify({
      "ext.pi-model-prompt": {
        rules: [
          { match: "gpt", append: ["ant.md"] },
          { match: "unused", append: ["missing\x1b]52;c;Zml4dHVyZQ==\x07.md"] }
        ]
      }
    })
  );
  await fixture.session.setModel(fixture.claude);
  await fixture.session.prompt("claude before reload");
  expect(fixture.requests[2]).toContain(claudeAddendum);
  expect(fixture.notify).not.toHaveBeenCalled();

  await fixture.session.reload();
  await fixture.session.prompt("claude after reload");
  expect(fixture.requests[3]).toContain(addendum("BASE-APPEND"));

  await fixture.session.setModel(fixture.gpt);
  await fixture.session.prompt("gpt after reload");
  expect(fixture.requests[4]).toContain(addendum("BASE-APPEND\n\nANT-RELOADED"));

  expect(fixture.notify).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(join(fixture.agentDir, "missing.md")),
    "warning"
  );
  const [warning] = fixture.notify.mock.calls[0]!;
  expect(warning).not.toContain("\x1b");
  expect(warning).not.toContain("\x07");
  expect(fixture.errors).toEqual([]);
});

it.each([
  ["CLI text", { cliAppend: "EXPLICIT-APPEND" }, "EXPLICIT-APPEND\n\nANT-APPEND\n\nSHARED-APPEND"],
  [
    "earlier-extension text",
    { earlierAppend: "EXPLICIT-APPEND" },
    "EXPLICIT-APPEND\n\nANT-APPEND\n\nSHARED-APPEND"
  ],
  ["empty append text", { earlierAppend: "" }, "ANT-APPEND\n\nSHARED-APPEND"]
] as const)("adds the selected files after %s", async (_name, options, expected) => {
  const fixture = await host(options);

  await fixture.session.prompt("first");
  expect(fixture.requests[0]).toContain(addendum(expected));
  expect(fixture.errors).toEqual([]);
});

it("ignores project settings in trusted projects", async () => {
  const fixture = await host({
    projectTrusted: true,
    projectFiles: {
      "ant.md": "PROJECT-APPEND",
      "settings.json": JSON.stringify({
        "ext.pi-model-prompt": { rules: [{ match: ".", append: ["ant.md"] }] }
      })
    }
  });

  await fixture.session.prompt("claude");
  expect(fixture.requests[0]).toContain(claudeAddendum);

  await fixture.session.setModel(fixture.gpt);
  await fixture.session.prompt("gpt");
  expect(fixture.requests[1]).toContain(addendum("BASE-APPEND"));
  expect(fixture.errors).toEqual([]);
});
