import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider, type ImageContent } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionUIContext,
  type InputEvent
} from "@earendil-works/pi-coding-agent";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import { afterEach, expect, it, vi } from "vite-plus/test";

import skills from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

async function host({
  mode = "tui",
  enabled = true,
  before = (_pi: ExtensionAPI) => {}
}: {
  mode?: ExtensionContext["mode"];
  enabled?: boolean;
  before?: (pi: ExtensionAPI) => void;
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pi-skills-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(cwd);
  await mkdir(agentDir);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  let skillPath = join(directory, "review notes.md");
  const writeSkill = (path: string, name = "review") =>
    writeFile(path, `---\nname: ${name}\ndescription: Fixture skill\n---\nSECRET SKILL BODY\n`);
  await writeSkill(skillPath);
  const inputs: InputEvent[] = [];
  const catalogs: ReturnType<ExtensionAPI["getCommands"]>[] = [];
  let api: ExtensionAPI | undefined;
  const settingsManager = SettingsManager.inMemory({
    enableSkillCommands: enabled,
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
    promptsOverride: () => ({
      prompts: [
        {
          name: "template",
          description: "Fixture",
          content: "Generated /skill:review",
          filePath: join(directory, "template.md"),
          sourceInfo: {
            path: join(directory, "template.md"),
            source: "fixture",
            scope: "temporary",
            origin: "top-level"
          }
        }
      ],
      diagnostics: []
    }),
    extensionFactories: [
      before,
      skills,
      (pi) => {
        api = pi;
        pi.on("session_start", () => {
          catalogs.push(pi.getCommands());
        });
        pi.on("resources_discover", () => ({ skillPaths: [skillPath] }));
        pi.on("input", (event) => {
          inputs.push(event);
        });
      }
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const faux = fauxProvider();
  faux.setResponses(Array.from({ length: 20 }, () => fauxAssistantMessage("Offline response")));
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
    model: faux.getModel(),
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all"
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  });
  const addAutocompleteProvider = vi.fn<ExtensionUIContext["addAutocompleteProvider"]>();
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode,
    uiContext: { ...session.extensionRunner.createContext().ui, addAutocompleteProvider },
    onError: (error) => {
      errors.push(error);
    }
  });

  return {
    session,
    settingsManager,
    inputs,
    catalogs,
    addAutocompleteProvider,
    errors,
    getApi: () => api!,
    getSkillPath: () => skillPath,
    changeSkill: async () => {
      skillPath = join(directory, "fresh.md");
      await writeSkill(skillPath, "fresh");
    }
  };
}

it.each(["tui", "rpc", "print", "json"] as const)(
  "expands in %s mode, registers completion only for TUI, and preserves native persistence",
  async (mode) => {
    const fixture = await host({ mode });
    const source = mode === "rpc" ? "rpc" : "interactive";
    await fixture.session.prompt("/skill:review then /skill:review", { source });
    const expected = `/skill:${fixture.getSkillPath()} then /skill:${fixture.getSkillPath()}`;
    expect(fixture.inputs).toMatchObject([{ text: expected, source }]);
    expect(fixture.session.messages.find((message) => message.role === "user")).toMatchObject({
      content: [{ type: "text", text: expected }]
    });
    const entry = fixture.session.sessionManager
      .getEntries()
      .find((item) => item.type === "message" && item.message.role === "user");
    expect(entry).toMatchObject({
      type: "message",
      message: { role: "user", content: [{ type: "text", text: expected }] }
    });
    expect(fixture.addAutocompleteProvider).toHaveBeenCalledTimes(mode === "tui" ? 1 : 0);
    expect(fixture.errors).toEqual([]);
  }
);

it.each([false, true])(
  "sendUserMessage transforms with native expansion=%s",
  async (expandPromptTemplates) => {
    const fixture = await host();
    await fixture.session.sendUserMessage("/skill:review", { expandPromptTemplates });
    expect(fixture.inputs).toMatchObject([
      { source: "extension", text: `/skill:${fixture.getSkillPath()}` }
    ]);
    expect(fixture.session.messages.find((message) => message.role === "user")).toMatchObject({
      content: [{ type: "text", text: `/skill:${fixture.getSkillPath()}` }]
    });
    expect(fixture.errors).toEqual([]);
  }
);

it("preserves images and steering/follow-up delivery through the real host", async () => {
  const fixture = await host();
  const image: ImageContent = { type: "image", mimeType: "image/png", data: "fixture" };
  const steer = vi.spyOn(fixture.session.agent, "steer");
  const followUp = vi.spyOn(fixture.session.agent, "followUp");
  await fixture.session.steer("Use /skill:review", [image], { source: "rpc" });
  await fixture.session.followUp("Use /skill:review", [image], { source: "interactive" });

  for (const spy of [steer, followUp]) {
    expect(spy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        role: "user",
        content: [{ type: "text", text: `Use /skill:${fixture.getSkillPath()}` }, image]
      })
    );
    const message = spy.mock.calls[0]![0];
    expect(message.role === "user" && message.content[1]).toBe(image);
  }

  for (const source of ["interactive", "rpc", "extension"] as const) {
    for (const delivery of ["steer", "followUp"] as const) {
      const result = await fixture.session.extensionRunner.emitInput(
        "/skill:review",
        [image],
        source,
        delivery
      );
      expect(result).toMatchObject({
        action: "transform",
        text: `/skill:${fixture.getSkillPath()}`,
        images: [image]
      });
      expect(fixture.inputs.at(-1)).toMatchObject({ source, streamingBehavior: delivery });
      expect(fixture.inputs.at(-1)!.images![0]).toBe(image);
    }
  }
});

it("respects earlier transforms/consumption, pre-input commands, and later native template expansion", async () => {
  const invoked = vi.fn();
  const fixture = await host({
    before: (pi) => {
      pi.registerCommand("owned", { handler: invoked });
      pi.on("input", (event) => {
        if (event.text === "consume") return { action: "handled" };
        if (event.text === "rewrite") return { action: "transform", text: "/skill:review" };
      });
    }
  });
  await fixture.session.prompt("/owned /skill:review");
  await fixture.session.prompt("consume");
  expect(invoked).toHaveBeenCalledTimes(1);
  expect(fixture.inputs).toEqual([]);
  await fixture.session.prompt("rewrite");
  expect(fixture.inputs.at(-1)!.text).toBe(`/skill:${fixture.getSkillPath()}`);
  await fixture.session.prompt("/template");
  expect(fixture.inputs.at(-1)!.text).toBe("/template");
  expect(
    fixture.session.messages.filter((message) => message.role === "user").at(-1)
  ).toMatchObject({
    content: [{ type: "text", text: "Generated /skill:review" }]
  });
  await fixture.session.sendCustomMessage({
    customType: "fixture",
    content: "/skill:review",
    display: false
  });
  expect(fixture.inputs).toHaveLength(2);
  expect(fixture.errors).toEqual([]);
});

it("uses current resources after discovery/reload and reconstructs wrappers for settings changes", async () => {
  const fixture = await host({ enabled: false });
  expect(fixture.catalogs[0]!.filter((item) => item.source === "skill")).toEqual([]);
  const factory = fixture.addAutocompleteProvider.mock.calls[0]![0];
  const completion = (enabled: boolean) =>
    factory(
      new CombinedAutocompleteProvider(
        fixture
          .getApi()
          .getCommands()
          .filter((item) => enabled || item.source !== "skill"),
        process.cwd()
      )
    );
  const options = { signal: new AbortController().signal };
  const disabled = completion(false);
  expect(await disabled.getSuggestions(["Use /skill:re"], 0, 13, options)).toBeNull();
  const result = await fixture.session.extensionRunner.emitInput(
    "/skill:review",
    undefined,
    "interactive"
  );
  expect(result).toMatchObject({ action: "transform", text: `/skill:${fixture.getSkillPath()}` });
  fixture.settingsManager.setEnableSkillCommands(true);
  expect(await completion(true).getSuggestions(["Use /skill:re"], 0, 13, options)).toMatchObject({
    items: [{ value: "skill:review" }]
  });
  expect(await disabled.getSuggestions(["Use /skill:re"], 0, 13, options)).toBeNull();
  await fixture.changeSkill();
  await fixture.session.reload();
  expect(fixture.addAutocompleteProvider).toHaveBeenCalledTimes(2);
  expect(
    await fixture.session.extensionRunner.emitInput(
      "/skill:fresh /skill:review",
      undefined,
      "interactive"
    )
  ).toMatchObject({
    action: "transform",
    text: `/skill:${fixture.getSkillPath()} /skill:review`
  });
  const reloaded = fixture.addAutocompleteProvider.mock.calls[1]![0](
    new CombinedAutocompleteProvider(fixture.getApi().getCommands(), process.cwd())
  );
  expect(await reloaded.getSuggestions(["/skill:fr"], 0, 9, options)).toMatchObject({
    items: [{ value: "skill:fresh" }]
  });
  expect(fixture.errors).toEqual([]);
});
