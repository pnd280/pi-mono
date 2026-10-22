import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionUIContext,
  type SlashCommandInfo
} from "@earendil-works/pi-coding-agent";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import skills from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

async function host({
  enabled = true,
  format,
  template = false
}: { enabled?: boolean; format?: string; template?: boolean } = {}) {
  const directory = await createValidationWorkspace("pi-skills-test-");
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  const templatePath = join(directory, "outline.md");
  if (template) await writeFile(templatePath, "OUTLINE TEMPLATE");
  const settingsPath = join(agentDir, "settings.json");
  const setExpansionFormat = (expansionFormat: string) =>
    writeFile(settingsPath, JSON.stringify({ "ext.pi-skills": { expansionFormat } }));
  if (format !== undefined) await setExpansionFormat(format);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  let skillPath = join(directory, "review notes.md");
  const writeSkill = (path: string, name = "review") =>
    writeFile(path, `---\nname: ${name}\ndescription: Fixture skill\n---\nSECRET SKILL BODY\n`);
  await writeSkill(skillPath);
  let getCommands: (() => SlashCommandInfo[]) | undefined;
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
    extensionFactories: [
      skills,
      (pi) => {
        getCommands = () => pi.getCommands();
        pi.on("resources_discover", () => ({
          skillPaths: [skillPath],
          promptPaths: template ? [templatePath] : []
        }));
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
    mode: "tui",
    uiContext: { ...session.extensionRunner.createContext().ui, addAutocompleteProvider },
    onError: (error) => {
      errors.push(error);
    }
  });

  return {
    session,
    addAutocompleteProvider,
    errors,
    getCommands: () => getCommands!(),
    getSkillPath: () => skillPath,
    setExpansionFormat,
    changeSkill: async () => {
      skillPath = join(directory, "fresh.md");
      await writeSkill(skillPath, "fresh");
    }
  };
}

function userTexts(session: Awaited<ReturnType<typeof host>>["session"]): string[] {
  return session.messages
    .filter((message) => message.role === "user")
    .map((message) => {
      const content = message.content[0];

      if (typeof content !== "object" || content.type !== "text") {
        throw new Error("Expected a user text message");
      }

      return content.text;
    });
}

it("loads formats with skill commands disabled and reloads without native skill injection", async () => {
  const fixture = await host({ enabled: false, format: "Read {path} for {command}" });
  const first = `Read ${fixture.getSkillPath()} for /skill:review`;
  await fixture.session.prompt("/skill:review");
  expect(userTexts(fixture.session)).toEqual([first]);

  await fixture.setExpansionFormat("{command} ({path})");
  await fixture.session.reload();
  const second = ` /skill:review (${fixture.getSkillPath()})`;
  await fixture.session.prompt("/skill:review");
  await fixture.session.prompt(second);
  expect(userTexts(fixture.session)).toEqual([first, second, second]);
  expect(fixture.errors).toEqual([]);
});

it("keeps leading skill references literal while ordinary prompt templates expand", async () => {
  const fixture = await host({ format: "/outline {path}", template: true });
  const reference = `/outline ${fixture.getSkillPath()} keep my request`;
  await fixture.session.prompt("/skill:review keep my request");
  await fixture.session.prompt(reference);
  await fixture.session.prompt("/outline ordinary request");
  await fixture.session.prompt(`/outline ${fixture.getSkillPath()}.backup keep my request`);
  expect(userTexts(fixture.session)).toEqual([
    ` ${reference}`,
    ` ${reference}`,
    "OUTLINE TEMPLATE",
    "OUTLINE TEMPLATE"
  ]);
  expect(fixture.errors).toEqual([]);
});

it("expands and completes only the currently registered skills after reload", async () => {
  const fixture = await host();
  const completion = () =>
    fixture.addAutocompleteProvider.mock.calls.at(-1)![0](
      new CombinedAutocompleteProvider(fixture.getCommands(), process.cwd())
    );
  const options = { signal: new AbortController().signal };
  await fixture.session.prompt("/skill:review");
  const first = `[/skill:review](<${fixture.getSkillPath()}>)`;
  expect(userTexts(fixture.session)).toEqual([first]);

  await fixture.changeSkill();
  await fixture.session.reload();
  await fixture.session.prompt("/skill:fresh /skill:review");
  expect(userTexts(fixture.session)).toEqual([
    first,
    `[/skill:fresh](<${fixture.getSkillPath()}>) /skill:review`
  ]);
  expect(await completion().getSuggestions(["/skill:"], 0, 7, options)).toMatchObject({
    items: [{ value: "skill:fresh" }]
  });
  expect(fixture.errors).toEqual([]);
});
