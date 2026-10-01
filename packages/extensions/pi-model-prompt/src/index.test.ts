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

async function host({
  mode = "rpc",
  cliAppend,
  earlierAppend,
  projectFiles = {},
  projectTrusted = false
}: {
  mode?: ExtensionContext["mode"];
  cliAppend?: string;
  earlierAppend?: string;
  projectFiles?: Record<string, string>;
  projectTrusted?: boolean;
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
  await write("ant.md", "ANT-APPEND");
  await write("shared.md", "SHARED-APPEND");
  await write(
    "settings.json",
    JSON.stringify({
      "ext.pi-model-prompt": {
        rules: [{ match: "^faux/claude-", append: ["ant.md", join(agentDir, "shared.md")] }]
      }
    })
  );
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
    mode,
    ...(mode === "print"
      ? {}
      : { uiContext: { ...session.extensionRunner.createContext().ui, notify } }),
    onError: (error) => {
      errors.push(error);
    }
  });

  return { session, requests, notify, errors, write, agentDir, claude, gpt: gpt! };
}

it("replaces the base append text for matching models and restores it after switching", async () => {
  const fixture = await host();

  await fixture.session.prompt("first");
  expect(fixture.requests[0]).toContain("ANT-APPEND\n\nSHARED-APPEND");
  expect(fixture.requests[0]).not.toContain("BASE-APPEND");

  await fixture.session.setModel(fixture.gpt);
  await fixture.session.prompt("second");
  expect(fixture.requests[1]).toContain("BASE-APPEND");
  expect(fixture.requests[1]).not.toContain("ANT-APPEND");

  await fixture.session.setModel(fixture.claude);
  await fixture.session.prompt("third");
  expect(fixture.requests[2]).toContain("ANT-APPEND");
  expect(fixture.requests[2]).not.toContain("BASE-APPEND");
  expect(fixture.errors).toEqual([]);
});

it.each(["CLI", "earlier extension"] as const)(
  "keeps different append text from %s",
  async (source) => {
    const fixture = await host(
      source === "CLI" ? { cliAppend: "EXPLICIT-APPEND" } : { earlierAppend: "EXPLICIT-APPEND" }
    );

    await fixture.session.prompt("first");
    expect(fixture.requests[0]).toContain("EXPLICIT-APPEND");
    expect(fixture.requests[0]).not.toContain("ANT-APPEND");
    expect(fixture.errors).toEqual([]);
  }
);

it.each([true, false])(
  "follows Pi's base discovery for project trust (%s) but ignores project settings",
  async (projectTrusted) => {
    const fixture = await host({
      projectTrusted,
      projectFiles: {
        "APPEND_SYSTEM.md": "PROJECT-BASE",
        "settings.json": JSON.stringify({ "ext.pi-model-prompt": { rules: [] } })
      }
    });

    await fixture.session.prompt("first");
    expect(fixture.requests[0]).toContain("ANT-APPEND");
    expect(fixture.requests[0]).not.toContain("PROJECT-BASE");
    expect(fixture.requests[0]).not.toContain("BASE-APPEND");
    expect(fixture.errors).toEqual([]);
  }
);

it.each(["rpc", "print"] as const)(
  "reloads snapshots and gates warnings in %s mode",
  async (mode) => {
    const fixture = await host({ mode });
    expect(fixture.notify).not.toHaveBeenCalled();

    await fixture.write("ant.md", "ANT-RELOADED");
    await fixture.write(
      "settings.json",
      JSON.stringify({
        "ext.pi-model-prompt": {
          rules: [
            { match: "gpt", append: ["ant.md"] },
            { match: "unused", append: ["missing.md"] }
          ]
        }
      })
    );
    await fixture.session.prompt("before reload");
    expect(fixture.requests[0]).toContain("ANT-APPEND");
    expect(fixture.requests[0]).not.toContain("ANT-RELOADED");

    await fixture.session.reload();
    await fixture.session.prompt("after reload");
    expect(fixture.requests[1]).toContain("BASE-APPEND");
    expect(fixture.requests[1]).not.toContain("ANT-APPEND");

    await fixture.session.setModel(fixture.gpt);
    await fixture.session.prompt("new rule");
    expect(fixture.requests[2]).toContain("ANT-RELOADED");
    expect(fixture.requests[2]).not.toContain("BASE-APPEND");

    if (mode === "print") {
      expect(fixture.notify).not.toHaveBeenCalled();
    } else {
      expect(fixture.notify).toHaveBeenCalledExactlyOnceWith(
        `pi-model-prompt: ${join(fixture.agentDir, "missing.md")} could not be read; rules listing it keep APPEND_SYSTEM.md`,
        "warning"
      );
    }

    expect(fixture.errors).toEqual([]);
  }
);
