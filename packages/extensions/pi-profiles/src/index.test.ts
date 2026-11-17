import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
  getCurrentTools,
  type AssistantMessage,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import {
  AgentSessionRuntime,
  createAgentSession,
  createAgentSessionFromServices,
  createAgentSessionServices,
  createMcpExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionServices,
  type ExtensionAPI,
  type ExtensionContext,
  type McpTransportFactory,
  type ToolExposure
} from "@earendil-works/pi-coding-agent";
import { isolateEnvironment, STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { Type } from "typebox";
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
  appendSystemPrompts: ["plan-a.md", "plan-b.md"],
  tools: { deny: ["beta"] }
};
/** Files by path from the fixture root. Global paths resolve from `agent`, project paths from `work/.pi`. */
const planPrompts = { "agent/plan-a.md": "PLAN-A\n", "agent/plan-b.md": "PLAN-B\n" };
const build = { name: "build", description: "Build", tools: { deny: ["alpha"] } };
const focus = { name: "focus", description: "Focus", tools: { allow: ["gamma"] } };

const testTools: [string, ToolExposure][] = [
  ["alpha", "direct"],
  ["beta", "direct"],
  ["gamma", "deferred"],
  ["delta", "codemode"],
  ["epsilon", "deferred"]
];

/** An extension that registers the tools. */
const toolsExtension = (tools: readonly [string, ToolExposure][]) => (pi: ExtensionAPI) => {
  for (const [name, exposure] of tools) {
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
};

/** Registers tools of each exposure and append text, as an extension loaded earlier would. */
function earlierExtension(pi: ExtensionAPI) {
  toolsExtension(testTools)(pi);

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

/**
 * Records the active tools when each `tool_search` call returns, before the turn-end enforcement of `deny` removes any.
 */
function searchResults() {
  const results: { active: string[] }[] = [];

  const extension = (pi: ExtensionAPI) => {
    pi.on("tool_result", (event) => {
      if (event.toolName !== "tool_search") return;
      results.push({ active: pi.getActiveTools().sort() });
    });
  };

  return { results, extension };
}

type McpMessage = Parameters<ReturnType<McpTransportFactory>["send"]>[0];

/**
 * Pi's MCP extension with in-memory servers. Each server offers one tool, `ping`, so a server with `direct` exposure shows in the declared tools while it is connected. `events` records each connection and close, by server name.
 */
function fakeMcp() {
  const events: string[] = [];

  const createTransport: McpTransportFactory = ({ name }) => {
    let deliver: ((message: McpMessage) => void) | undefined;
    const closeListeners: (() => void)[] = [];
    let closed = false;
    events.push(`connect ${name}`);

    return {
      start: () => Promise.resolve(),
      send: (message) => {
        if ("method" in message && "id" in message) {
          const result =
            message.method === "initialize"
              ? {
                  protocolVersion: "2025-06-18",
                  capabilities: { tools: {} },
                  serverInfo: { name, version: "1" }
                }
              : { tools: [{ name: "ping", inputSchema: { type: "object" } }] };
          queueMicrotask(() => deliver?.({ jsonrpc: "2.0", id: message.id, result }));
        }

        return Promise.resolve();
      },
      close: () => {
        if (!closed) {
          closed = true;
          events.push(`close ${name}`);
          for (const listener of closeListeners) listener();
        }

        return Promise.resolve();
      },
      onMessage: (listener) => {
        deliver = listener;

        return () => {};
      },
      onError: () => () => {},
      onClose: (listener) => {
        closeListeners.push(listener);

        return () => {};
      }
    };
  };

  /** The declarable MCP tools, and how often each server connected and closed. */
  const state = (session: AgentSession) => {
    const active = session.getActiveToolNames();
    const count = (kind: string) =>
      Object.fromEntries(
        [...new Set(events)]
          .filter((event) => event.startsWith(`${kind} `))
          .map((event) => [event.slice(kind.length + 1), events.filter((e) => e === event).length])
      );

    return {
      tools: session
        .getAllTools()
        .filter(
          ({ name, exposure }) =>
            name.startsWith("mcp__") && exposure !== "hidden" && active.includes(name)
        )
        .map(({ name }) => name)
        .sort(),
      connects: count("connect"),
      closes: count("close")
    };
  };

  return { events, state, extension: createMcpExtension({ createTransport }) };
}

const mcpTools = (requests: readonly Request[]) =>
  requests.map(({ tools }) => tools.filter((name) => name.startsWith("mcp__")));

type Request = {
  model: string;
  thinking: string | undefined;
  tools: string[];
  append: string | undefined;
};

async function workspace(
  settings: unknown,
  projectSettings?: unknown,
  prompts: Record<string, string> = {}
) {
  const directory = await mkdtemp(join(tmpdir(), "pi-profiles-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
  await writeFile(join(agentDir, "settings.json"), JSON.stringify({ "ext.pi-profiles": settings }));
  for (const [path, text] of Object.entries({ ...planPrompts, ...prompts }))
    await writeFile(join(directory, path), text);

  if (projectSettings !== undefined) {
    await writeFile(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ "ext.pi-profiles": projectSettings })
    );
  }

  isolateEnvironment(directory);

  return { cwd, agentDir, sessionDir: join(directory, "sessions") };
}

async function host(
  { cwd, agentDir }: Awaited<ReturnType<typeof workspace>>,
  {
    extensions = [earlierExtension],
    excludeTools = [],
    flags = {},
    loadFromFile = false,
    mode = "rpc",
    projectTrusted = false,
    replies = [],
    runtimeOwned = false,
    sessionManager = SessionManager.inMemory(cwd),
    tools
  }: {
    extensions?: ((pi: ExtensionAPI) => void)[];
    excludeTools?: string[];
    flags?: Record<string, string>;
    loadFromFile?: boolean;
    mode?: ExtensionContext["mode"];
    projectTrusted?: boolean;
    replies?: (() => AssistantMessage | Promise<AssistantMessage>)[];
    runtimeOwned?: boolean;
    sessionManager?: SessionManager;
    /** Pi's `--tools` allowlist. */
    tools?: string[];
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
    additionalExtensionPaths: loadFromFile
      ? [fileURLToPath(new URL("../index.ts", import.meta.url))]
      : [],
    extensionFactories: loadFromFile ? extensions : [...extensions, profiles]
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
    sessionManager,
    excludeTools,
    ...(tools && { tools })
  });

  if (!runtimeOwned) {
    cleanups.push(async () => {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      session.dispose();
    });
  }

  const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
  const errors: unknown[] = [];
  // Print and JSON runs bind no UI, as Pi's print mode does.
  const ui = (
    mode === "print" || mode === "json"
      ? {}
      : { uiContext: { ...session.extensionRunner.createContext().ui, notify } }
  ) satisfies Partial<Pick<Parameters<AgentSession["bindExtensions"]>[0], "uiContext">>;
  await session.bindExtensions({
    mode,
    ...ui,
    onError: (error) => {
      errors.push(error);
    }
  });

  const services: AgentSessionServices = {
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    diagnostics: []
  };

  return { session, requests, errors, services, notify };
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
    fauxAssistantMessage(fauxToolCall("tool_search", { query: "delta epsilon" }), {
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
    { ...after, tools: ["beta", "delta", "epsilon", "gamma", "tool_search"] }
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

  const modelOnly = toolsExtension([["zeta", "model-only"]]);

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
  const beforeDeny = SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir);

  // Another extension owns tool_search, so `direct` tools stay declared, on restore and on switch.
  const foreign = await host(dirs, {
    extensions: [earlierExtension, modelOnly, foreignSearch],
    sessionManager: SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir)
  });
  await foreign.session.prompt("restored");
  await foreign.session.prompt("/profile lean");
  await foreign.session.prompt("switched");

  // Without any tool_search, restoration must also declare native deferred and codemode tools.
  const withoutSearch = await host(dirs, {
    extensions: [earlierExtension, modelOnly],
    excludeTools: ["tool_search"],
    sessionManager: SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir)
  });
  await withoutSearch.session.prompt("restored without search");
  expect(withoutSearch.requests.at(-1)?.tools).toEqual([
    "alpha",
    "delta",
    "epsilon",
    "gamma",
    "zeta"
  ]);

  const resumed = await host(dirs, {
    extensions: [earlierExtension, modelOnly],
    replies: [call("tool_search", { query: "alpha beta delta zeta" })],
    sessionManager: SessionManager.open(file)
  });
  await resumed.session.prompt("search");

  const all = ["alpha", "beta", "delta", "epsilon", "gamma", "zeta"];
  expect([...first.requests, ...resumed.requests].map(({ tools }) => tools)).toEqual([
    all,
    all,
    all,
    ["gamma", "tool_search"],
    ["alpha", "delta", "gamma", "tool_search", "zeta"]
  ]);
  expect(foreign.requests.map(({ tools }) => tools)).toEqual([
    ["alpha", "gamma", "tool_search", "zeta"],
    ["alpha", "delta", "epsilon", "gamma", "zeta"]
  ]);

  // A `tool_search` that the profile now denies is not available, so restoration declares the deferred tools again.
  await writeFile(
    join(dirs.agentDir, "settings.json"),
    JSON.stringify({
      "ext.pi-profiles": {
        profiles: [strict, { ...lean, tools: { ...lean.tools, deny: ["beta", "tool_search"] } }]
      }
    })
  );
  const searchDenied = await host(dirs, {
    extensions: [earlierExtension, modelOnly],
    sessionManager: beforeDeny
  });
  await searchDenied.session.prompt("restored with tool_search denied");
  expect(searchDenied.requests.at(-1)?.tools).toEqual([
    "alpha",
    "delta",
    "epsilon",
    "gamma",
    "zeta"
  ]);
  expect([
    ...first.errors,
    ...foreign.errors,
    ...withoutSearch.errors,
    ...resumed.errors,
    ...searchDenied.errors
  ]).toEqual([]);
});

it("matches * patterns in deny and defer against the registered tools, and in allow only against direct, model-only, and base tools, and defers each match of a defer pattern on its own", async () => {
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
  // zeta (model-only) matches `*a` and is selected; theta (deferred, not a base tool) matches it and is not.
  const fixture = await host(await workspace({ profiles: [wild, single] }), {
    extensions: [
      earlierExtension,
      toolsExtension([
        ["zeta", "model-only"],
        ["theta", "deferred"]
      ])
    ],
    replies: [search, () => fauxAssistantMessage("done"), search]
  });
  fixture.session.setActiveToolsByName(["alpha", "beta", "gamma"]);

  // `*a` keeps the base tool gamma. As in Pi's `--tools`, it does not turn on the codemode tool delta.
  await fixture.session.prompt("/profile wild");
  await fixture.session.prompt("search");
  // `*a` matches alpha and gamma, but loading alpha does not load gamma.
  await fixture.session.prompt("/profile single");
  await fixture.session.prompt("search again");

  expect(fixture.requests.map(({ tools }) => tools)).toEqual([
    ["gamma", "tool_search", "zeta"],
    ["alpha", "gamma", "tool_search", "zeta"],
    ["tool_search"],
    ["alpha", "tool_search"]
  ]);
  expect(fixture.errors).toEqual([]);
});

it("keeps deny tools off for the whole selection when an extension or --tools turns them on again", async () => {
  /** Turns on beta, and registers a new tool, from tool calls during a run. */
  const toolChanges = (pi: ExtensionAPI) => {
    const tool = (name: string, run: () => void) => {
      pi.registerTool({
        name,
        label: name,
        description: `Test tool ${name}`,
        parameters: Type.Object({}),
        execute: () => {
          run();

          return Promise.resolve({ content: [{ type: "text", text: "ok" }], details: undefined });
        }
      });
    };

    tool("enable_beta", () => {
      pi.setActiveTools([...pi.getActiveTools(), "beta"]);
    });
    tool("register_late", () => {
      tool("late", () => undefined);
    });
  };

  const call = (name: string) => () =>
    fauxAssistantMessage(fauxToolCall(name, {}), { stopReason: "toolUse" });
  const dirs = await workspace({ profiles: [plan] });

  // Another extension turns beta on before a run and during it.
  const extension = await host(dirs, {
    extensions: [earlierExtension, toolChanges],
    replies: [call("enable_beta")]
  });
  await extension.session.prompt("/profile plan");
  extension.session.setActiveToolsByName([...extension.session.getActiveToolNames(), "beta"]);
  await extension.session.prompt("enable beta");

  // With `--tools`, each registry refresh turns on every listed tool again, beta too.
  const allowlist = await host(dirs, {
    extensions: [earlierExtension, toolChanges],
    replies: [call("register_late")],
    tools: ["alpha", "beta", "register_late", "late"]
  });
  await allowlist.session.prompt("/profile plan");
  await allowlist.session.prompt("register late");

  const requests = [...extension.requests, ...allowlist.requests].map(({ tools }) => tools);
  expect(requests.map((tools) => tools.includes("beta"))).toEqual([false, false, false, false]);
  // The second request follows the registry refresh that the late registration caused.
  expect(requests[3]).toContain("late");
  expect([...extension.errors, ...allowlist.errors]).toEqual([]);
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
  const beforeDeny = SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir);

  // Another extension's `tool_search` cannot load a group together, so it stays declared, on restoration and on a switch, also when Pi's search could load each of its tools.
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

  // After `deny` gains alpha, loading gamma does not load alpha with its saved group, and tool_search does not load alpha by name.
  await writeFile(
    join(dirs.agentDir, "settings.json"),
    JSON.stringify({
      "ext.pi-profiles": {
        profiles: [{ ...grouped, tools: { ...grouped.tools, deny: ["alpha"] } }, native]
      }
    })
  );
  const searches = searchResults();
  const denied = await host(dirs, {
    extensions: [earlierExtension, searches.extension],
    replies: [
      () =>
        fauxAssistantMessage(fauxToolCall("tool_search", { query: "alpha gamma" }), {
          stopReason: "toolUse"
        })
    ],
    sessionManager: beforeDeny
  });
  await denied.session.prompt("search with alpha denied");

  expect(searches.results).toHaveLength(1);
  expect(searches.results[0]?.active).toEqual(["beta", "delta", "gamma", "tool_search"]);
  expect([...first.errors, ...foreign.errors, ...resumed.errors, ...denied.errors]).toEqual([]);
});

it("restores the branch's latest selection after tree navigation, resume, and reload", async () => {
  // `allow` removes beta, so the `deny` enforcement does not hide whether /reload turns it on again.
  const allowPlan = { ...plan, tools: { allow: ["alpha"] } };
  const dirs = await workspace({ profiles: [allowPlan, build], defaultProfile: "build" });
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

  // Pi has no tool record before the first request, so leaving a selection must undo its tools.
  const unselected = await host(dirs);
  const initialLeaf = unselected.session.sessionManager.getLeafId()!;
  await unselected.session.prompt("/profile build");
  await unselected.session.navigateTree(initialLeaf);
  await unselected.session.prompt("first request without a selection");
  expect(unselected.requests.at(-1)).toMatchObject({ tools: ["alpha", "beta"], append: "EARLIER" });
  expect(unselected.errors).toEqual([]);

  // Tree navigation must not move a switch's selection onto the destination branch while the switch waits for a model_select handler.
  const releaseModel = Promise.withResolvers<void>();
  let modelSelected = false;
  const concurrent = await host(dirs, {
    mode: "tui",
    extensions: [
      earlierExtension,
      (pi) => {
        pi.on("model_select", async () => {
          modelSelected = true;
          await releaseModel.promise;
        });
      }
    ]
  });
  await concurrent.session.prompt("before switch");
  const target = concurrent.session.sessionManager.getLeafId()!;
  const switching = concurrent.session.prompt("/profile plan");

  try {
    await expect.poll(() => modelSelected, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    const navigating = concurrent.session.navigateTree(target);
    releaseModel.resolve();
    await Promise.all([switching, navigating]);
  } finally {
    releaseModel.resolve();
    await switching;
  }

  await concurrent.session.prompt("after navigation");
  expect(concurrent.requests.at(-1)).toMatchObject({ tools: ["beta"], append: "EARLIER" });
  expect(concurrent.errors).toEqual([]);

  // A same-file resume must wait for the switch before Pi opens the destination session file.
  const releaseResumeModel = Promise.withResolvers<void>();
  let resumeModelSelected = false;
  const extensions = [
    earlierExtension,
    (pi: ExtensionAPI) => {
      pi.on("model_select", async () => {
        resumeModelSelected = true;
        await releaseResumeModel.promise;
      });
    }
  ];
  const beforeResume = await host(dirs, {
    extensions,
    runtimeOwned: true,
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  const runtime = new AgentSessionRuntime(
    beforeResume.session,
    beforeResume.services,
    async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        settingsManager: beforeResume.services.settingsManager,
        modelRuntime: beforeResume.services.modelRuntime,
        resourceLoaderOptions: {
          noExtensions: true,
          noSkills: true,
          noThemes: true,
          noContextFiles: true,
          noPromptTemplates: true,
          extensionFactories: [...extensions, profiles]
        }
      });
      const created = await createAgentSessionFromServices({
        services,
        sessionManager,
        ...(sessionStartEvent && { sessionStartEvent })
      });

      return { ...created, services, diagnostics: services.diagnostics };
    }
  );
  runtime.setRebindSession(async (session) => {
    await session.bindExtensions({
      mode: "rpc",
      onError: (error) => {
        beforeResume.errors.push(error);
      }
    });
  });
  cleanups.push(() => runtime.dispose());
  await runtime.session.prompt("before same-file resume");
  const sessionFile = runtime.session.sessionFile!;
  const resumeSwitch = runtime.session.prompt("/profile plan");

  try {
    await expect.poll(() => resumeModelSelected, { timeout: STEP_TIMEOUT_MS }).toBe(true);
    const resuming = runtime.switchSession(sessionFile);
    releaseResumeModel.resolve();
    await Promise.all([resumeSwitch, resuming]);
  } finally {
    releaseResumeModel.resolve();
    await resumeSwitch;
  }

  await runtime.session.prompt("after same-file resume");
  expect(beforeResume.requests.at(-1)).toMatchObject({ tools: ["alpha"], append });
  expect(beforeResume.errors).toEqual([]);
});

const both = ["alpha", "beta"];
const searching = ["beta", "tool_search"];

it.each([
  [
    true,
    [
      ["PROJECT", searching],
      ["PROJECT", [...both, "tool_search"]],
      ["PROJECT-PLAN", ["alpha"]],
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
    const profile = (name: string) => ({
      name,
      description: name,
      appendSystemPrompts: [`${name}.md`]
    });
    const dirs = await workspace(
      { profiles: [profile("plan"), profile("keep")], defaultProfile: "keep" },
      {
        profiles: [
          { ...profile("plan"), tools: { deny: ["beta"] } },
          { ...profile("project"), tools: { defer: ["alpha"] } }
        ],
        defaultProfile: "project"
      },
      {
        "agent/plan.md": "GLOBAL-PLAN",
        "agent/keep.md": "KEEP",
        "work/.pi/plan.md": "PROJECT-PLAN",
        "work/.pi/project.md": "PROJECT"
      }
    );
    // No global profile defers tools, so only the project profile can need tool_search.
    const fixture = await host(dirs, {
      mode: "tui",
      projectTrusted,
      sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir),
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
    const afterProject = fixture.session.sessionManager.getLeafId()!;
    await fixture.session.prompt("/profile keep");
    await fixture.session.prompt("three");

    expect(fixture.requests.map(({ append, tools }) => ({ append, tools }))).toEqual(
      requests.map(([prompt, tools]) => ({ append: `EARLIER\n\n${prompt}`, tools }))
    );
    expect(fixture.errors).toEqual([]);
    if (!projectTrusted) return;

    // Denied trust on resume: the saved selection of the project plan, with no request after it, must not restore its tools or prompts, also though a global profile has its name. Pi keeps the tools of the last request.
    await fixture.session.prompt("/profile plan");
    const resumed = await host(dirs, {
      mode: "tui",
      sessionManager: SessionManager.open(fixture.session.sessionManager.getSessionFile()!),
      replies: [
        () => fauxAssistantMessage("done"),
        () => fauxAssistantMessage("done"),
        () =>
          fauxAssistantMessage(fauxToolCall("tool_search", { query: "alpha" }), {
            stopReason: "toolUse"
          })
      ]
    });
    await resumed.session.prompt("four");
    // Leaving the project plan's selection for the start of the session, before any selection or request, must not undo its saved removal of `beta`.
    resumed.session.setActiveToolsByName(["alpha"]);
    await resumed.session.navigateTree(fixture.session.sessionManager.getEntries()[0]!.id);
    await resumed.session.prompt("five");
    // On the project profile's branch, its saved deferral must not let tool_search load `alpha`.
    await resumed.session.navigateTree(afterProject);
    await resumed.session.prompt("six");

    expect(resumed.requests.map(({ append, tools }) => ({ append, tools }))).toEqual([
      { append: "EARLIER", tools: both },
      { append: "EARLIER", tools: ["alpha"] },
      { append: "EARLIER", tools: searching },
      { append: "EARLIER", tools: searching }
    ]);
    expect(resumed.errors).toEqual([]);
  }
);

it.each([null, "missing"])(
  "applies no default profile, not the global one, when a trusted project's defaultProfile is invalid (%s)",
  async (defaultProfile) => {
    const keep = { name: "keep", description: "Keep", appendSystemPrompts: ["keep.md"] };
    const dirs = await workspace(
      { profiles: [keep], defaultProfile: "keep" },
      { defaultProfile },
      { "agent/keep.md": "KEEP" }
    );
    const fixture = await host(dirs, { mode: "tui", projectTrusted: true });

    await fixture.session.prompt("zero");

    expect(fixture.requests.map(({ append }) => append)).toEqual(["EARLIER"]);
    expect(fixture.errors).toEqual([]);
  }
);

it.each([
  ["tui", "second", ["alpha"]],
  // RPC, print, and JSON share the `ctx.mode === "tui"` default-profile gate in startProfile (src/index.ts).
  ["rpc", "first", ["alpha", "beta"]]
] as const)(
  "applies --profile at startup in any mode, else the default profile only in interactive sessions without a selection (%s)",
  async (mode, model, tools) => {
    const dirs = await workspace({ profiles: [plan, build], defaultProfile: "plan" });
    const first = await host(dirs, {
      mode,
      loadFromFile: true,
      sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
    });
    await first.session.prompt("one");
    await first.session.prompt("/profile clear");

    // No profile is a selection, so the default profile does not apply when the session resumes.
    const resumed = await host(dirs, {
      mode,
      loadFromFile: true,
      sessionManager: SessionManager.open(first.session.sessionManager.getSessionFile()!)
    });
    await resumed.session.prompt("two");

    // When Pi starts, --profile replaces the resumed selection.
    const flagged = await host(dirs, {
      mode,
      loadFromFile: true,
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

it("connects only the selected profile's MCP servers on a switch, no profile, tree navigation, and resume, keeps a server whose entry stays, and saves no server entry", async () => {
  const server = (env: Record<string, string>) => ({ command: "fake", exposure: "direct", env });
  const shared = server({ TOKEN: "SECRET-SHARED" });
  const dirs = await workspace({
    profiles: [
      { name: "one", description: "One", mcpServers: { shared, only: server({}) } },
      { name: "two", description: "Two", mcpServers: { shared, other: server({}) } },
      {
        name: "three",
        description: "Three",
        mcpServers: { shared: server({ TOKEN: "SECRET-CHANGED" }) }
      }
    ]
  });
  const mcp = fakeMcp();
  const fixture = await host(dirs, {
    extensions: [earlierExtension, mcp.extension],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  const settled = (expected: ReturnType<typeof mcp.state>) =>
    expect.poll(() => mcp.state(fixture.session), { timeout: STEP_TIMEOUT_MS }).toEqual(expected);

  await fixture.session.prompt("/profile one");
  await settled({
    tools: ["mcp__only__ping", "mcp__shared__ping"],
    connects: { shared: 1, only: 1 },
    closes: {}
  });
  await fixture.session.prompt("one");
  const oneLeaf = fixture.session.sessionManager.getLeafId()!;

  // `shared` keeps its connection, because its entry stays the same.
  await fixture.session.prompt("/profile two");
  await settled({
    tools: ["mcp__other__ping", "mcp__shared__ping"],
    connects: { shared: 1, only: 1, other: 1 },
    closes: { only: 1 }
  });
  await fixture.session.prompt("two");

  await fixture.session.prompt("/profile three");
  await settled({
    tools: ["mcp__shared__ping"],
    connects: { shared: 2, only: 1, other: 1 },
    closes: { only: 1, shared: 1, other: 1 }
  });
  await fixture.session.prompt("three");

  await fixture.session.prompt("/profile clear");
  await settled({
    tools: [],
    connects: { shared: 2, only: 1, other: 1 },
    closes: { only: 1, shared: 2, other: 1 }
  });
  await fixture.session.prompt("none");

  await fixture.session.navigateTree(oneLeaf);
  await settled({
    tools: ["mcp__only__ping", "mcp__shared__ping"],
    connects: { shared: 3, only: 2, other: 1 },
    closes: { only: 1, shared: 2, other: 1 }
  });
  await fixture.session.prompt("back to one");

  const resumedMcp = fakeMcp();
  const resumed = await host(dirs, {
    extensions: [earlierExtension, resumedMcp.extension],
    sessionManager: SessionManager.open(fixture.session.sessionManager.getSessionFile()!)
  });
  await expect
    .poll(() => resumedMcp.state(resumed.session), { timeout: STEP_TIMEOUT_MS })
    .toEqual({
      tools: ["mcp__only__ping", "mcp__shared__ping"],
      connects: { shared: 1, only: 1 },
      closes: {}
    });
  await resumed.session.prompt("resumed");

  expect(mcpTools(fixture.requests)).toEqual([
    ["mcp__only__ping", "mcp__shared__ping"],
    ["mcp__other__ping", "mcp__shared__ping"],
    ["mcp__shared__ping"],
    [],
    ["mcp__only__ping", "mcp__shared__ping"]
  ]);
  expect(mcpTools(resumed.requests)).toEqual([["mcp__only__ping", "mcp__shared__ping"]]);
  const file = fixture.session.sessionManager.getSessionFile()!;
  const saved = await readFile(file, "utf8");
  const selections = SessionManager.open(file)
    .getEntries()
    .flatMap((entry) =>
      entry.type === "custom" && entry.customType === "pi-profiles.selection" ? [entry.data] : []
    );
  expect(selections).not.toEqual([]);
  for (const data of selections)
    expect(JSON.stringify(data)).not.toMatch(/"(?:mcpServers|command|env|exposure)"/u);
  expect(saved).not.toContain("SECRET-");
  expect([...fixture.errors, ...resumed.errors]).toEqual([]);
});

it("skips a trusted project profile whose MCP server sends a Pi login token, so none of its servers connect", async () => {
  const url = "https://mcp.example.test/mcp";
  const dirs = await workspace(
    { profiles: [] },
    {
      profiles: [
        { name: "safe", description: "Safe", mcpServers: { safe: { url, exposure: "direct" } } },
        {
          name: "leak",
          description: "Leak",
          mcpServers: {
            plain: { url, exposure: "direct" },
            leak: { url, exposure: "direct", auth: { provider: "faux" } }
          }
        }
      ]
    }
  );
  const mcp = fakeMcp();
  const fixture = await host(dirs, {
    projectTrusted: true,
    extensions: [earlierExtension, mcp.extension]
  });

  await fixture.session.prompt("/profile leak");
  // The project's other profile connects its server, so the skip comes from `auth`.
  await fixture.session.prompt("/profile safe");
  await expect
    .poll(() => mcp.state(fixture.session), { timeout: STEP_TIMEOUT_MS })
    .toEqual({ tools: ["mcp__safe__ping"], connects: { safe: 1 }, closes: {} });
  await fixture.session.prompt("one");

  expect(mcp.events).toEqual(["connect safe"]);
  expect(mcpTools(fixture.requests)).toEqual([["mcp__safe__ping"]]);
  expect(fixture.errors).toEqual([]);
});
