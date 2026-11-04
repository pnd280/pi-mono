import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import {
  CONFIG_DIR_NAME,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionFactory
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import skills from "pi-skills";
import { afterEach, expect, it, vi } from "vite-plus/test";

import t3Skills from "../index.ts";
import t3InputHook from "../validation/t3-input-hook.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

interface HostOptions {
  /** File contents keyed by path relative to the workspace, which holds `agent` and `work`. */
  files?: Record<string, string>;
  /** The session's working directory, relative to the workspace. */
  cwd?: string;
  projectTrusted?: boolean;
}

async function host(
  extensions: ExtensionFactory[],
  { files = {}, cwd: relativeCwd = "work", projectTrusted = true }: HostOptions = {}
) {
  const directory = await createValidationWorkspace("pi-t3-skills-test-");
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, relativeCwd);
  const agentDir = join(directory, "agent");
  await mkdir(cwd, { recursive: true });

  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content);
  }

  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const skillPath = join(directory, "review notes.md");
  await writeFile(
    skillPath,
    "---\nname: review\ndescription: Fixture skill\n---\nSECRET SKILL BODY\nRun /skill:review again.\n"
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
    extensionFactories: [
      ...extensions,
      (pi) => {
        pi.on("resources_discover", () => ({ skillPaths: [skillPath] }));
      }
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const requests: string[] = [];
  const faux = fauxProvider();
  faux.setResponses(
    Array.from({ length: 5 }, () => (context: { messages: unknown[] }) => {
      requests.push(JSON.stringify(context.messages));

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
  const sessionManager = SessionManager.create(cwd, join(directory, "sessions"));
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: faux.getModel(),
    thinkingLevel: "off",
    sessionManager,
    noTools: "all"
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  });
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode: "rpc",
    onError: (error) => {
      errors.push(error);
    }
  });

  return {
    session,
    errors,
    requests,
    skillPath,
    savedSession: () => readFile(sessionManager.getSessionFile()!, "utf8")
  };
}

it.each([
  { order: "before this extension", extensions: [t3InputHook, t3Skills] },
  { order: "after this extension", extensions: [t3Skills, t3InputHook] },
  // pi-skills would expand the /skill: token in T3's block before an exact match at its rank.
  { order: "before this extension and pi-skills", extensions: [t3InputHook, t3Skills, skills] }
])(
  "sends T3 skill chips as references without skill blocks when T3's hook loads $order",
  async ({ extensions }) => {
    vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "/t3/pi-t3-mcp-extension.ts");
    const fixture = await host(extensions);
    await fixture.session.prompt("Use $review and $review");

    const reference = `[/skill:review](<${fixture.skillPath}>)`;
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toContain(JSON.stringify(`Use ${reference} and ${reference}`));
    const saved = await fixture.savedSession();
    expect(saved).toContain(JSON.stringify(`Use ${reference} and ${reference}`));

    for (const text of [fixture.requests[0], saved]) {
      expect(text).not.toContain("<skill");
      expect(text).not.toContain("SECRET SKILL BODY");
    }

    expect(fixture.errors).toEqual([]);
  }
);

const section = (value: unknown) => JSON.stringify({ "ext.pi-t3-skills": value });
const projectSettings = join("work", CONFIG_DIR_NAME, "settings.json");
const globalFormat = (path: string) => `File: ${path}`;

it.each([
  {
    case: "a trusted current-directory format overrides the global one",
    project: { expansionFormat: "Read {path} for {command}" },
    expected: (path: string) => `Read ${path} for /skill:review`
  },
  {
    case: "an untrusted project format is ignored",
    project: { expansionFormat: "Read {path} for {command}" },
    projectTrusted: false
  },
  {
    case: "a trusted ancestor's format is ignored",
    project: { expansionFormat: "Read {path} for {command}" },
    cwd: join("work", "child")
  },
  { case: "a format without {path} is ignored", project: { expansionFormat: "{command}" } },
  {
    case: "a format over 512 code points is ignored",
    project: { expansionFormat: "x".repeat(513) + "{path}" }
  },
  {
    case: "a section with an unknown key is ignored",
    project: { expansionFormat: "{path}", unknown: true }
  },
  { case: "a format that isn't a string is ignored", project: { expansionFormat: 2 } }
])("$case", async ({ project, projectTrusted, cwd, expected = globalFormat }) => {
  vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "/t3/pi-t3-mcp-extension.ts");
  const fixture = await host([t3Skills], {
    files: {
      [join("agent", "settings.json")]: section({ expansionFormat: "File: {path}" }),
      [projectSettings]: section(project)
    },
    ...(cwd === undefined ? {} : { cwd }),
    ...(projectTrusted === undefined ? {} : { projectTrusted })
  });
  await fixture.session.prompt("Use $review");

  expect(fixture.requests).toHaveLength(1);
  expect(fixture.requests[0]).toContain(JSON.stringify(`Use ${expected(fixture.skillPath)}`));
  expect(fixture.errors).toEqual([]);
});

it("leaves skill chips unchanged outside T3", async () => {
  vi.stubEnv("T3_PI_MCP_EXTENSION_PATH", "");
  const fixture = await host([t3Skills]);
  await fixture.session.prompt("Use $review");

  expect(fixture.requests).toHaveLength(1);
  expect(fixture.requests[0]).toContain(JSON.stringify("Use $review"));
  expect(fixture.errors).toEqual([]);
});
