import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
  getCurrentTools,
  Type,
  type AssistantMessage,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolExposure
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import profiles from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

/** The append text in Pi's prompt section, as the model receives it. */
const addendum = (prompt: string) => /<addendum>\n([\s\S]*)\n<\/addendum>/u.exec(prompt)?.[1];

const plan = {
  name: "plan",
  description: "Plan",
  model: "faux/second",
  thinking: "high",
  appendSystemPrompts: ["PLAN-A", "PLAN-B"],
  tools: { deny: ["beta"] }
};
const build = { name: "build", description: "Build", tools: { deny: ["alpha"] } };
const focus = { name: "focus", description: "Focus", tools: { allow: ["gamma"] } };

const testTools: [string, ToolExposure][] = [
  ["alpha", "direct"],
  ["beta", "direct"],
  ["gamma", "deferred"],
  ["delta", "codemode"],
  ["epsilon", "deferred"]
];

/** Registers tools of each exposure and append text, as an extension loaded earlier would. */
function earlierExtension(pi: ExtensionAPI) {
  for (const [name, exposure] of testTools) {
    pi.registerTool({
      name,
      label: name,
      description: `Test tool ${name}`,
      parameters: Type.Object({}),
      exposure,
      execute: () =>
        Promise.resolve({ content: [{ type: "text", text: `${name} ran` }], details: undefined })
    });
  }

  pi.on("before_agent_start", (event) => {
    event.systemPromptOptions.appendSystemPrompt = "EARLIER";
  });
}

/** Registers another `tool_search` after loading, which Pi prefers because it loaded first. */
function foreignSearch(pi: ExtensionAPI) {
  pi.on("session_start", () => {
    pi.registerTool({
      name: "tool_search",
      label: "tool_search",
      description: "Another search",
      parameters: Type.Object({}),
      execute: () =>
        Promise.resolve({ content: [{ type: "text", text: "none" }], details: undefined })
    });
  });
}

interface Request {
  model: string;
  thinking: string | undefined;
  tools: string[];
  append: string | undefined;
}

async function workspace(settings: unknown, projectSettings?: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "pi-profiles-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
  await writeFile(join(agentDir, "settings.json"), JSON.stringify({ "ext.pi-profiles": settings }));

  if (projectSettings !== undefined) {
    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ "ext.pi-profiles": projectSettings })
    );
  }

  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");

  return { cwd, agentDir, sessionDir: join(directory, "sessions") };
}

async function host(
  { cwd, agentDir }: Awaited<ReturnType<typeof workspace>>,
  {
    extensions = [earlierExtension],
    flags = {},
    mode = "rpc",
    projectTrusted = false,
    replies = [],
    sessionManager = SessionManager.inMemory(cwd)
  }: {
    extensions?: ((pi: ExtensionAPI) => void)[];
    flags?: Record<string, string>;
    mode?: ExtensionContext["mode"];
    projectTrusted?: boolean;
    replies?: (() => AssistantMessage | Promise<AssistantMessage>)[];
    sessionManager?: SessionManager;
  } = {}
) {
  // Pi restores recorded tools only for sessions that use `defaultTools`.
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false, keepRecentTokens: 1 },
    retry: { enabled: false },
    defaultTools: []
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
    extensionFactories: [...extensions, profiles]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  // Pi's CLI stores parsed extension flags here after the extensions load.
  for (const [name, value] of Object.entries(flags))
    resourceLoader.getExtensions().runtime.flagValues.set(name, value);

  const requests: Request[] = [];
  const faux = fauxProvider({
    provider: "faux",
    models: [
      { id: "first", reasoning: true },
      { id: "second", reasoning: true }
    ]
  });
  faux.setResponses(
    Array.from(
      { length: 10 },
      (): FauxResponseFactory => async (context, options, _state, model) => {
        requests.push({
          model: model.id,
          thinking: options?.reasoning,
          tools: getCurrentTools(context.messages)
            .map(({ name }) => name)
            .sort(),
          append: addendum(getCurrentSystemPrompt(context.messages))
        });

        return (await replies.shift()?.()) ?? fauxAssistantMessage("done");
      }
    )
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(agentDir, "models-store.json"),
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  modelRuntime.registerNativeProvider(faux.provider);
  // Extensions select only models whose provider passed the availability check.
  await modelRuntime.refresh({ allowNetwork: false });
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: faux.models[0],
    thinkingLevel: "off",
    sessionManager
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
  });
  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
  const errors: unknown[] = [];
  // Print and JSON runs bind no UI, as Pi's print mode does.
  const ui =
    mode === "print" || mode === "json"
      ? {}
      : { uiContext: { ...session.extensionRunner.createContext().ui, notify } };
  await session.bindExtensions({
    mode,
    ...ui,
    onError: (error) => {
      errors.push(error);
    }
  });

  return { session, requests, errors };
}

it("applies the profile's model, thinking, tools, and prompts, and undoes them on the next switch, also to no profile; tool_search loads searchable tools without a defer list", async () => {
  const replies: (() => AssistantMessage)[] = [];
  const fixture = await host(await workspace({ profiles: [plan, build, focus] }), { replies });

  await fixture.session.prompt("/profile plan");
  await fixture.session.prompt("one");
  // A tool change after the switch stays, because a switch undoes only the previous profile.
  fixture.session.setActiveToolsByName(["alpha", "gamma"]);
  await fixture.session.prompt("/profile clear");
  await fixture.session.prompt("none");
  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("two");
  await fixture.session.prompt("/profile focus");
  await fixture.session.prompt("three");
  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("four");
  // pi-profiles' tool_search replaces Pi's built-in also when no profile defers tools.
  fixture.session.setActiveToolsByName(["beta", "gamma", "tool_search"]);
  replies.push(() =>
    fauxAssistantMessage(fauxToolCall("tool_search", { query: "epsilon" }), {
      stopReason: "toolUse"
    })
  );
  await fixture.session.prompt("search");

  const after = { model: "second", thinking: "high", append: "EARLIER" };
  expect(fixture.requests).toEqual([
    { model: "second", thinking: "high", tools: ["alpha"], append: "EARLIER\n\nPLAN-A\n\nPLAN-B" },
    { ...after, tools: ["alpha", "beta", "gamma"] },
    { ...after, tools: ["beta", "gamma"] },
    { ...after, tools: ["gamma"] },
    { ...after, tools: ["beta", "gamma"] },
    { ...after, tools: ["beta", "gamma", "tool_search"] },
    { ...after, tools: ["beta", "epsilon", "gamma", "tool_search"] }
  ]);
  expect(fixture.errors).toEqual([]);
});

it("defers unused tools of any exposure only when tool_search can load them again", async () => {
  const strict = {
    name: "strict",
    description: "No tool_search",
    tools: { deny: ["tool_*"], defer: ["alpha", "delta"] }
  };
  const lean = {
    name: "lean",
    description: "Lean",
    tools: { deny: ["beta"], defer: ["alpha", "gamma", "delta", "epsilon", "zeta"] }
  };

  const modelOnly = (pi: ExtensionAPI) => {
    pi.registerTool({
      name: "zeta",
      label: "zeta",
      description: "Test tool zeta",
      parameters: Type.Object({}),
      exposure: "model-only",
      execute: () =>
        Promise.resolve({ content: [{ type: "text", text: "zeta ran" }], details: undefined })
    });
  };

  const call =
    (name: string, args = {}) =>
    () =>
      fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
  const dirs = await workspace({ profiles: [strict, lean] });
  const first = await host(dirs, {
    extensions: [earlierExtension, modelOnly],
    replies: [call("gamma")],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  first.session.setActiveToolsByName(["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]);

  await first.session.prompt("use gamma");
  await first.session.prompt("/profile strict");
  await first.session.prompt("without tool_search");
  await first.session.prompt("/profile lean");
  const file = first.session.sessionManager.getSessionFile()!;

  // Another extension owns tool_search, so `direct` tools stay declared, on restore and on switch.
  const foreign = await host(dirs, {
    extensions: [earlierExtension, modelOnly, foreignSearch],
    sessionManager: SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir)
  });
  await foreign.session.prompt("restored");
  await foreign.session.prompt("/profile lean");
  await foreign.session.prompt("switched");

  const resumed = await host(dirs, {
    extensions: [earlierExtension, modelOnly],
    replies: [call("tool_search", { query: "alpha beta delta" })],
    sessionManager: SessionManager.open(file)
  });
  await resumed.session.prompt("search");

  const all = ["alpha", "beta", "delta", "epsilon", "gamma", "zeta"];
  expect([...first.requests, ...resumed.requests].map(({ tools }) => tools)).toEqual([
    all,
    all,
    all,
    ["gamma", "tool_search"],
    ["alpha", "delta", "gamma", "tool_search"]
  ]);
  expect(foreign.requests.map(({ tools }) => tools)).toEqual([
    ["alpha", "gamma", "tool_search", "zeta"],
    ["alpha", "delta", "epsilon", "gamma", "zeta"]
  ]);
  expect([...first.errors, ...foreign.errors, ...resumed.errors]).toEqual([]);
});

it("matches * patterns in allow, deny, and defer against the registered tools, and defers each match of a defer pattern on its own", async () => {
  const wild = {
    name: "wild",
    description: "Wild",
    tools: { allow: ["*a", "tool_*"], deny: ["b*"], defer: ["al*"] }
  };
  const single = {
    name: "single",
    description: "Single",
    tools: { allow: ["alpha", "gamma", "tool_search"], defer: ["*a"] }
  };
  const search = () =>
    fauxAssistantMessage(fauxToolCall("tool_search", { query: "alpha" }), {
      stopReason: "toolUse"
    });
  const fixture = await host(await workspace({ profiles: [wild, single] }), {
    replies: [search, () => fauxAssistantMessage("done"), search]
  });
  fixture.session.setActiveToolsByName(["alpha", "beta"]);

  await fixture.session.prompt("/profile wild");
  await fixture.session.prompt("search");
  // `*a` matches alpha and gamma, but loading alpha does not load gamma.
  await fixture.session.prompt("/profile single");
  await fixture.session.prompt("search again");

  expect(fixture.requests.map(({ tools }) => tools)).toEqual([
    ["delta", "gamma", "tool_search"],
    ["alpha", "delta", "gamma", "tool_search"],
    ["tool_search"],
    ["alpha", "tool_search"]
  ]);
  expect(fixture.errors).toEqual([]);
});

it("gives each tool to its first defer entry, defers a group only as a whole, and loads it together only with pi-profiles' tool_search, also after resume", async () => {
  const grouped = {
    name: "grouped",
    description: "Grouped",
    tools: {
      // epsilon belongs to its own entry, the first that matches it, so it does not load with alpha.
      defer: ["epsilon", ["alpha", "g*", "epsilon"], ["beta", "delta"]]
    }
  };
  const native = {
    name: "native",
    description: "Native",
    tools: { allow: ["gamma", "delta", "tool_search"], defer: [["gamma", "delta"]] }
  };
  const search = () =>
    fauxAssistantMessage(fauxToolCall("tool_search", { query: "alpha" }), {
      stopReason: "toolUse"
    });
  const dirs = await workspace({ profiles: [grouped, native] });
  const first = await host(dirs, {
    replies: [
      () => fauxAssistantMessage(fauxToolCall("beta", {}), { stopReason: "toolUse" }),
      () => fauxAssistantMessage("done"),
      search
    ],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  first.session.setActiveToolsByName(["alpha", "beta", "gamma", "delta", "epsilon"]);

  await first.session.prompt("use beta");
  // The branch used beta, so its group stays declared; the other group is deferred.
  await first.session.prompt("/profile grouped");
  const file = first.session.sessionManager.getSessionFile()!;

  // Another extension's `tool_search` cannot load a group together, so it stays declared, on
  // restoration and on a switch, also when Pi's search could load each of its tools.
  const foreign = await host(dirs, {
    extensions: [earlierExtension, foreignSearch],
    sessionManager: SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir)
  });
  await foreign.session.prompt("restored");
  await foreign.session.prompt("/profile native");
  await foreign.session.prompt("switched");

  // A query that matches only alpha also loads gamma, after resume and in the switched session.
  const resumed = await host(dirs, {
    replies: [search],
    sessionManager: SessionManager.open(file)
  });
  await resumed.session.prompt("search");
  await first.session.prompt("search");

  const loaded = [
    ["beta", "delta", "tool_search"],
    ["alpha", "beta", "delta", "gamma", "tool_search"]
  ];
  expect(foreign.requests.map(({ tools }) => tools)).toEqual([
    ["alpha", "beta", "delta", "gamma", "tool_search"],
    ["delta", "gamma", "tool_search"]
  ]);
  expect(resumed.requests.map(({ tools }) => tools)).toEqual(loaded);
  expect(first.requests.slice(-2).map(({ tools }) => tools)).toEqual(loaded);
  expect([...first.errors, ...foreign.errors, ...resumed.errors]).toEqual([]);
});

it("restores the branch's latest selection after tree navigation, resume, and reload", async () => {
  const dirs = await workspace({ profiles: [plan, build], defaultProfile: "build" });
  const first = await host(dirs, {
    mode: "tui",
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });

  await first.session.prompt("zero");
  await first.session.prompt("one");
  const beforeSelection = first.session.sessionManager.getLeafId()!;
  await first.session.prompt("/profile plan");
  // The compaction checkpoint copies the tools recorded before the selection.
  await first.session.compact();
  const selection = first.session.sessionManager.getLeafId()!;

  await first.session.navigateTree(beforeSelection);
  expect(first.session.getActiveToolNames().sort()).toEqual(["beta"]);
  const file = first.session.sessionManager.getSessionFile()!;
  await first.session.navigateTree(selection);
  expect(first.session.getActiveToolNames().sort()).toEqual(["alpha"]);

  const resumed = await host(dirs, {
    mode: "tui",
    sessionManager: SessionManager.open(first.session.sessionManager.getSessionFile()!)
  });
  await resumed.session.prompt("two");
  // Later changes win over the selection, also when /reload turns on `direct` tools again.
  resumed.session.setActiveToolsByName(["alpha", "gamma"]);
  await resumed.session.prompt("three");
  resumed.session.setActiveToolsByName(["alpha", "gamma", "epsilon"]);
  await resumed.session.reload();
  await resumed.session.prompt("four");
  const again = await host(dirs, { mode: "tui", sessionManager: SessionManager.open(file) });
  await again.session.prompt("five");
  // On the branch before the selection, its default profile adds no prompts.
  await again.session.navigateTree(beforeSelection);
  await again.session.prompt("six");
  // A request with the recorded tools and prompt can add no system message, but it follows the switch.
  await again.session.prompt("/profile clear");
  again.session.setActiveToolsByName(["beta"]);
  await again.session.prompt("seven");
  const last = await host(dirs, { mode: "tui", sessionManager: SessionManager.open(file) });
  await last.session.prompt("eight");

  expect(first.requests[0]).toMatchObject({ tools: ["beta"], append: "EARLIER" });
  const append = "EARLIER\n\nPLAN-A\n\nPLAN-B";
  expect(resumed.requests).toMatchObject([
    { tools: ["alpha"], append },
    { tools: ["alpha", "gamma"], append },
    { tools: ["alpha", "epsilon", "gamma"], append }
  ]);
  expect(again.requests).toMatchObject([
    { tools: ["alpha", "epsilon", "gamma"], append },
    { tools: ["beta"], append: "EARLIER" },
    { tools: ["beta"], append: "EARLIER" }
  ]);
  expect(last.requests).toMatchObject([{ tools: ["beta"], append: "EARLIER" }]);
  expect([...first.errors, ...resumed.errors, ...again.errors, ...last.errors]).toEqual([]);
});

const both = ["alpha", "beta"];
const searching = ["beta", "tool_search"];

it.each([
  [
    true,
    [
      ["PROJECT", searching],
      ["PROJECT", [...both, "tool_search"]],
      ["PROJECT-PLAN", both],
      ["PROJECT", searching],
      ["KEEP", both]
    ]
  ],
  [
    false,
    [
      ["KEEP", both],
      ["GLOBAL-PLAN", both],
      ["GLOBAL-PLAN", both],
      ["KEEP", both]
    ]
  ]
] as const)(
  "lets only trusted project settings add profiles, replace global profiles by name, and choose the default, whose deferred tools tool_search loads (trusted: %s)",
  async (projectTrusted, requests) => {
    const profile = (name: string, prompt: string) => ({
      name,
      description: prompt,
      appendSystemPrompts: [prompt]
    });
    const dirs = await workspace(
      {
        profiles: [profile("plan", "GLOBAL-PLAN"), profile("keep", "KEEP")],
        defaultProfile: "keep"
      },
      {
        profiles: [
          profile("plan", "PROJECT-PLAN"),
          { ...profile("project", "PROJECT"), tools: { defer: ["alpha"] } }
        ],
        defaultProfile: "project"
      }
    );
    // No global profile defers tools, so only the project profile can need tool_search.
    const fixture = await host(dirs, {
      mode: "tui",
      projectTrusted,
      replies: projectTrusted
        ? [
            () =>
              fauxAssistantMessage(fauxToolCall("tool_search", { query: "alpha" }), {
                stopReason: "toolUse"
              })
          ]
        : []
    });

    await fixture.session.prompt("zero");
    await fixture.session.prompt("/profile plan");
    await fixture.session.prompt("one");
    await fixture.session.prompt("/profile project");
    await fixture.session.prompt("two");
    await fixture.session.prompt("/profile keep");
    await fixture.session.prompt("three");

    expect(fixture.requests.map(({ append, tools }) => ({ append, tools }))).toEqual(
      requests.map(([prompt, tools]) => ({ append: `EARLIER\n\n${prompt}`, tools }))
    );
    expect(fixture.errors).toEqual([]);
  }
);

it.each([null, "missing"])(
  "applies no default profile, not the global one, when a trusted project's defaultProfile is invalid (%s)",
  async (defaultProfile) => {
    const keep = { name: "keep", description: "Keep", appendSystemPrompts: ["KEEP"] };
    const dirs = await workspace({ profiles: [keep], defaultProfile: "keep" }, { defaultProfile });
    const fixture = await host(dirs, { mode: "tui", projectTrusted: true });

    await fixture.session.prompt("zero");

    expect(fixture.requests.map(({ append }) => append)).toEqual(["EARLIER"]);
    expect(fixture.errors).toEqual([]);
  }
);

it.each([
  ["tui", "second", ["alpha"]],
  ["rpc", "first", ["alpha", "beta"]],
  ["print", "first", ["alpha", "beta"]],
  ["json", "first", ["alpha", "beta"]]
] as const)(
  "applies --profile at startup in any mode, else the default profile only in interactive sessions without a selection (%s)",
  async (mode, model, tools) => {
    const dirs = await workspace({ profiles: [plan, build], defaultProfile: "plan" });
    const first = await host(dirs, {
      mode,
      sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
    });
    await first.session.prompt("one");
    await first.session.prompt("/profile clear");

    // No profile is a selection, so the default profile does not apply when the session resumes.
    const resumed = await host(dirs, {
      mode,
      sessionManager: SessionManager.open(first.session.sessionManager.getSessionFile()!)
    });
    await resumed.session.prompt("two");

    // When Pi starts, --profile replaces the resumed selection.
    const flagged = await host(dirs, {
      mode,
      flags: { profile: "build" },
      sessionManager: SessionManager.open(first.session.sessionManager.getSessionFile()!)
    });
    await flagged.session.prompt("three");

    expect(first.requests[0]).toMatchObject({ model, tools });
    expect(resumed.requests[0]).toMatchObject({ tools: ["alpha", "beta"], append: "EARLIER" });
    expect(flagged.requests[0]).toMatchObject({ tools: ["beta"], append: "EARLIER" });
    expect([...first.errors, ...resumed.errors, ...flagged.errors]).toEqual([]);
  }
);
