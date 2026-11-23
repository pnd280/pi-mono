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
  initTheme,
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
import { NOTICE_MESSAGE } from "./notice.ts";

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
 * Pi's MCP extension with in-memory servers. Each server offers one tool, which its entry's first argument names, or else `ping`, so a server with `direct` exposure shows in the declared tools while it is connected, and the tool shows which entry connected. `events` records each connection and close, by server name.
 */
function fakeMcp() {
  const events: string[] = [];

  const createTransport: McpTransportFactory = ({ name, config }) => {
    const tool = ("args" in config ? config.args[0] : undefined) ?? "ping";
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
              : { tools: [{ name: tool, inputSchema: { type: "object" } }] };
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

  /** The MCP tools that Pi registered and does not hide, active or not, which shows that their servers listed them. */
  const registered = (session: AgentSession) =>
    session
      .getAllTools()
      .filter(({ name, exposure }) => name.startsWith("mcp__") && exposure !== "hidden")
      .map(({ name }) => name)
      .sort();

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
      tools: registered(session).filter((name) => active.includes(name)),
      connects: count("connect"),
      closes: count("close")
    };
  };

  return { events, registered, state, extension: createMcpExtension({ createTransport }) };
}

/** The command of every test MCP server entry. It has no secret, so a session file that contains it keeps a server entry. */
const MCP_COMMAND = "fake-mcp-server";

/** An MCP server entry whose tool, `ping` unless named, the model sees directly. */
const directServer = (env: Record<string, string> = {}, tool = "ping") => ({
  command: MCP_COMMAND,
  args: [tool],
  exposure: "direct",
  env
});

const mcpTools = (requests: readonly Request[]) =>
  requests.map(({ tools }) => tools.filter((name) => name.startsWith("mcp__")));

type Request = {
  model: string;
  thinking: string | undefined;
  tools: string[];
  append: string | undefined;
  texts: string[];
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

type HostOptions = {
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
};

/** Loads no resources besides the extensions. */
const onlyExtensions = {
  noExtensions: true,
  noSkills: true,
  noThemes: true,
  noContextFiles: true,
  noPromptTemplates: true
};

/** Binds the session's extensions, and records their errors and the error notifications that they show. */
async function bind(
  session: AgentSession,
  mode: ExtensionContext["mode"],
  { errors, errorNotifications }: { errors: unknown[]; errorNotifications: string[] }
) {
  await session.bindExtensions({
    mode,
    // A copy of Pi's no-op UI, so that `ctx.hasUI` is true, as in TUI and RPC runs.
    uiContext: {
      ...session.extensionRunner.createContext().ui,
      notify: (message, type = "info") => {
        if (type === "error") errorNotifications.push(message);
      }
    },
    onError: (error) => {
      errors.push(error);
    }
  });
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
  }: HostOptions = {}
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
    ...onlyExtensions,
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
      { length: 20 },
      (): FauxResponseFactory => async (context, options, _state, model) => {
        const texts = context.messages.flatMap((message) => {
          if (typeof message.content === "string") return [message.content];

          return message.content.flatMap((block) => (block.type === "text" ? [block.text] : []));
        });
        requests.push({
          model: model.id,
          thinking: options?.reasoning,
          tools: getCurrentTools(context.messages)
            .map(({ name }) => name)
            .sort(),
          append: addendum(getCurrentSystemPrompt(context.messages)),
          texts
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

  // Pi's interactive mode loads a theme, which the footer status of MCP presets uses.
  if (mode === "tui") initTheme("dark", false);
  const errors: unknown[] = [];
  const errorNotifications: string[] = [];
  await bind(session, mode, { errors, errorNotifications });

  const services: AgentSessionServices = {
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    diagnostics: []
  };

  return { session, requests, errors, errorNotifications, services };
}

/**
 * A host whose later sessions, after `/new`, `/resume`, or `/fork`, load the same extensions and flags, as Pi's CLI does. It takes no `--tools` or excluded tools, which those sessions would not get.
 */
async function runtimeHost(
  dirs: Awaited<ReturnType<typeof workspace>>,
  options: Omit<HostOptions, "excludeTools" | "loadFromFile" | "runtimeOwned" | "tools"> = {}
) {
  const first = await host(dirs, { ...options, runtimeOwned: true });
  const extensions = options.extensions ?? [earlierExtension];
  const runtime = new AgentSessionRuntime(
    first.session,
    first.services,
    async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir,
        settingsManager: first.services.settingsManager,
        modelRuntime: first.services.modelRuntime,
        resourceLoaderOptions: { ...onlyExtensions, extensionFactories: [...extensions, profiles] },
        extensionFlagValues: new Map(Object.entries(options.flags ?? {}))
      });
      const created = await createAgentSessionFromServices({
        services,
        sessionManager,
        ...(sessionStartEvent && { sessionStartEvent })
      });

      return { ...created, services, diagnostics: services.diagnostics };
    }
  );
  runtime.setRebindSession((session) => bind(session, options.mode ?? "rpc", first));
  cleanups.push(() => runtime.dispose());

  return { ...first, runtime };
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
  expect(fixture.requests).toMatchObject([
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
    replies: [call("tool_search", { query: "alpha delta zeta" })],
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
  const beforeResume = await runtimeHost(dirs, {
    extensions,
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  const { runtime } = beforeResume;
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
  const shared = directServer({ TOKEN: "SECRET-SHARED" });
  const dirs = await workspace({
    profiles: [
      { name: "one", description: "One", mcpServers: { shared, only: directServer() } },
      { name: "two", description: "Two", mcpServers: { shared, other: directServer() } },
      {
        name: "three",
        description: "Three",
        mcpServers: { shared: directServer({ TOKEN: "SECRET-CHANGED" }) }
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
  expect(saved).not.toContain(MCP_COMMAND);
  expect([...fixture.errors, ...resumed.errors]).toEqual([]);
});

it("skips a trusted project profile or MCP preset whose MCP server sends a Pi login token, so none of its servers connect", async () => {
  const url = "https://mcp.example.test/mcp";
  const leakServers = {
    plain: { url, exposure: "direct" },
    leak: { url, exposure: "direct", auth: { provider: "faux" } }
  };
  const dirs = await workspace(
    { profiles: [] },
    {
      profiles: [
        { name: "safe", description: "Safe", mcpServers: { safe: { url, exposure: "direct" } } },
        { name: "leak", description: "Leak", mcpServers: leakServers }
      ],
      mcpPresets: {
        ok: { mcpServers: { ok: { url, exposure: "direct" } } },
        leaky: { mcpServers: leakServers }
      }
    }
  );
  const mcp = fakeMcp();
  const fixture = await host(dirs, {
    projectTrusted: true,
    extensions: [earlierExtension, mcp.extension]
  });

  await fixture.session.prompt("/profile leak");
  await fixture.session.prompt("/mcp-presets leaky");
  // The project's other profile and preset connect their servers, so the skip comes from `auth`.
  await fixture.session.prompt("/profile safe");
  await fixture.session.prompt("/mcp-presets ok");
  await expect
    .poll(() => mcp.state(fixture.session), { timeout: STEP_TIMEOUT_MS })
    .toEqual({
      tools: ["mcp__ok__ping", "mcp__safe__ping"],
      connects: { safe: 1, ok: 1 },
      closes: {}
    });
  await fixture.session.prompt("one");

  expect([...mcp.events].sort()).toEqual(["connect ok", "connect safe"]);
  expect(mcpTools(fixture.requests)).toEqual([["mcp__ok__ping", "mcp__safe__ping"]]);
  expect(fixture.errors).toEqual([]);
});

it("saves only the names and scopes of active MCP presets, and restores a saved preset only when the current settings supply it from its scope, not a preset of its name from the other scope", async () => {
  const dirs = await workspace(
    { mcpPresets: { db: { mcpServers: { global_db: directServer({ TOKEN: "SECRET-G" }) } } } },
    { mcpPresets: { db: { mcpServers: { project_db: directServer({ TOKEN: "SECRET-P" }) } } } }
  );
  const mcp = fakeMcp();
  const fixture = await host(dirs, {
    projectTrusted: true,
    extensions: [earlierExtension, mcp.extension],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  await fixture.session.prompt("/mcp-presets db");
  await expect
    .poll(() => mcp.state(fixture.session).tools, { timeout: STEP_TIMEOUT_MS })
    .toEqual(["mcp__project_db__ping"]);
  await fixture.session.prompt("one");
  const file = fixture.session.sessionManager.getSessionFile()!;
  const savedPresets = () =>
    SessionManager.open(file)
      .getEntries()
      .flatMap((entry) =>
        entry.type === "custom" && entry.customType === "pi-profiles.mcp-presets"
          ? [entry.data]
          : []
      );
  const projectDb = { presets: [{ name: "db", scope: "project" }] };
  expect(savedPresets()).toStrictEqual([projectDb]);

  // With trust, resume connects the saved project preset again.
  const trustedMcp = fakeMcp();
  const trusted = await host(dirs, {
    projectTrusted: true,
    extensions: [earlierExtension, trustedMcp.extension],
    sessionManager: SessionManager.open(file)
  });
  await expect
    .poll(() => trustedMcp.state(trusted.session).tools, { timeout: STEP_TIMEOUT_MS })
    .toEqual(["mcp__project_db__ping"]);
  await trusted.session.prompt("trusted");
  expect(savedPresets()).toStrictEqual([projectDb]);

  // Without trust, the saved project preset stays off, and the global preset of its name connects only when turned on.
  const untrustedMcp = fakeMcp();
  const untrusted = await host(dirs, {
    extensions: [earlierExtension, untrustedMcp.extension],
    sessionManager: SessionManager.open(file)
  });
  await untrusted.session.prompt("untrusted");
  await untrusted.session.prompt("/mcp-presets db");
  await expect
    .poll(() => untrustedMcp.state(untrusted.session).tools, { timeout: STEP_TIMEOUT_MS })
    .toEqual(["mcp__global_db__ping"]);
  await untrusted.session.prompt("global");
  const globalDb = { presets: [{ name: "db", scope: "global" }] };
  expect(savedPresets()).toStrictEqual([projectDb, globalDb]);

  // With trust again, the saved global preset stays off, because the project preset of its name replaces it, and that project preset does not connect in its place.
  const regainedMcp = fakeMcp();
  const regained = await host(dirs, {
    projectTrusted: true,
    extensions: [earlierExtension, regainedMcp.extension],
    sessionManager: SessionManager.open(file)
  });
  await regained.session.prompt("trusted again");
  expect(savedPresets()).toStrictEqual([projectDb, globalDb]);

  expect(mcpTools(trusted.requests)).toEqual([["mcp__project_db__ping"]]);
  expect(untrustedMcp.events).toEqual(["connect global_db"]);
  expect(mcpTools(untrusted.requests)).toEqual([[], ["mcp__global_db__ping"]]);
  expect(regainedMcp.events).toEqual([]);
  expect(mcpTools(regained.requests)).toEqual([[]]);
  // Any other record that keeps a server entry would contain its command, with or without secrets.
  const saved = await readFile(file, "utf8");
  expect(saved).not.toContain("SECRET-");
  expect(saved).not.toContain(MCP_COMMAND);
  expect([...fixture.errors, ...trusted.errors, ...untrusted.errors, ...regained.errors]).toEqual(
    []
  );
});

it("lets an MCP preset replace a profile server of its name or namespace without an error and restore it when off, keeps clashing presets apart and restores the one that the current settings list first, and saves the presets of a switch only to a profile that lists them", async () => {
  /** With `clash`, preset `c` comes before `a` and has a server in `a`'s namespace. */
  const settings = (clash: boolean) => {
    const a = { mcpServers: { "x-y": directServer({}, "ping_a") } };
    const c = {
      mcpServers: clash ? { x_y: directServer({}, "ping_c") } : { cee: directServer() }
    };

    return {
      mcpPresets: {
        db: { mcpServers: { my_db: directServer({}, "ping_preset") } },
        same: { mcpServers: { keep: directServer({}, "ping_preset") } },
        ...(clash ? { c, a } : { a, c }),
        b: { mcpServers: { x_y: directServer({}, "ping_b") } },
        extra: { mcpServers: { extra: directServer() } }
      },
      profiles: [
        {
          name: "p",
          description: "P",
          mcpServers: {
            "my-db": directServer({}, "ping_profile"),
            keep: directServer({}, "ping_profile")
          }
        },
        { name: "on", description: "On", mcpPresets: ["extra"] },
        { name: "off", description: "Off", mcpPresets: [] },
        { name: "bad", description: "Bad", model: "faux/missing", mcpPresets: ["extra"] }
      ]
    };
  };

  const dirs = await workspace(settings(false));
  const mcp = fakeMcp();
  const fixture = await host(dirs, {
    extensions: [earlierExtension, mcp.extension],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  const file = fixture.session.sessionManager.getSessionFile()!;
  let seen = 0;

  /** Waits until Pi registered exactly these MCP tools. */
  const registered = (session: AgentSession, tools: string[], servers = mcp) =>
    expect
      .poll(() => servers.registered(session), { timeout: STEP_TIMEOUT_MS })
      .toEqual([...tools].sort());

  /** Runs the action, waits until exactly these connections and closes followed the previous step, and until Pi registered exactly these tools. */
  const step = async (action: string, events: string[], tools: string[]) => {
    await fixture.session.prompt(action);
    await expect
      .poll(() => mcp.events.slice(seen).sort(), { timeout: STEP_TIMEOUT_MS })
      .toEqual([...events].sort());
    seen = mcp.events.length;
    await registered(fixture.session, tools);
  };

  /** Starts Pi on a copy of the session file, and returns its connections and the MCP tools of its first request. */
  const reopened = async (tools: string[]) => {
    const reopenedMcp = fakeMcp();
    const copy = await host(dirs, {
      extensions: [earlierExtension, reopenedMcp.extension],
      sessionManager: SessionManager.forkFrom(file, dirs.cwd, dirs.sessionDir)
    });
    await registered(copy.session, tools, reopenedMcp);
    await copy.session.prompt("reopened");
    expect(copy.errors).toEqual([]);

    return { events: reopenedMcp.events, tools: mcpTools(copy.requests) };
  };

  const profileServers = ["mcp__keep__ping_profile", "mcp__my_db__ping_profile"];
  await step("/profile p", ["connect my-db", "connect keep"], profileServers);
  const replacing = fixture.errorNotifications.length;
  // A preset server in the namespace of a profile server replaces it, and so does one with its name.
  await step(
    "/mcp-presets db",
    ["close my-db", "connect my_db"],
    ["mcp__keep__ping_profile", "mcp__my_db__ping_preset"]
  );
  await fixture.session.prompt("db on");
  await step("/mcp-presets db", ["close my_db", "connect my-db"], profileServers);
  await step(
    "/mcp-presets same",
    ["close keep", "connect keep"],
    ["mcp__keep__ping_preset", "mcp__my_db__ping_profile"]
  );
  await fixture.session.prompt("same on");
  await step("/mcp-presets same", ["close keep", "connect keep"], profileServers);
  expect(fixture.errorNotifications.slice(replacing)).toEqual([]);

  const clashing = [
    "mcp__cee__ping",
    "mcp__keep__ping_profile",
    "mcp__my_db__ping_profile",
    "mcp__x_y__ping_a"
  ];
  await step("/mcp-presets a", ["connect x-y"], [...profileServers, "mcp__x_y__ping_a"]);
  // `b` clashes with the active `a`, so it stays off, and `a` turns off and on again without `x_y`.
  await step("/mcp-presets b", [], [...profileServers, "mcp__x_y__ping_a"]);
  await step("/mcp-presets a", ["close x-y"], profileServers);
  await step("/mcp-presets a", ["connect x-y"], [...profileServers, "mcp__x_y__ping_a"]);
  await step("/mcp-presets c", ["connect cee"], clashing);
  await fixture.session.prompt("clash refused");

  // No profile, a profile without `mcpPresets`, and a failed switch keep the active presets.
  await step(
    "/profile clear",
    ["close my-db", "close keep"],
    ["mcp__cee__ping", "mcp__x_y__ping_a"]
  );
  await step("/profile p", ["connect my-db", "connect keep"], clashing);
  await step("/profile bad", [], clashing);
  await fixture.session.prompt("kept");
  // `mcpPresets` replaces them, and `[]` turns them all off, also when Pi starts again on the session.
  await step(
    "/profile on",
    ["close my-db", "close keep", "close x-y", "close cee", "connect extra"],
    ["mcp__extra__ping"]
  );
  expect(await reopened(["mcp__extra__ping"])).toEqual({
    events: ["connect extra"],
    tools: [["mcp__extra__ping"]]
  });
  await step("/profile off", ["close extra"], []);
  await fixture.session.prompt("replaced");
  expect(await reopened([])).toEqual({ events: [], tools: [[]] });

  // Of two saved presets that now clash, the one that the current settings list first stays on, here neither the first saved nor the first by name.
  await step("/mcp-presets a", ["connect x-y"], ["mcp__x_y__ping_a"]);
  await step("/mcp-presets c", ["connect cee"], ["mcp__cee__ping", "mcp__x_y__ping_a"]);
  await writeFile(
    join(dirs.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-profiles": settings(true) })
  );
  await fixture.session.reload();
  await registered(fixture.session, ["mcp__x_y__ping_c"]);
  seen = mcp.events.length;
  await fixture.session.prompt("restored");
  // The dropped `a` stayed off, so it clashes with the active `c`.
  await step("/mcp-presets a", [], ["mcp__x_y__ping_c"]);
  await step("/mcp-presets c", ["close x_y"], []);

  expect(mcpTools(fixture.requests)).toEqual([
    ["mcp__keep__ping_profile", "mcp__my_db__ping_preset"],
    ["mcp__keep__ping_preset", "mcp__my_db__ping_profile"],
    clashing,
    clashing,
    [],
    ["mcp__x_y__ping_c"]
  ]);
  expect(fixture.errors).toEqual([]);
});

it("applies a valid --mcp-presets at startup in place of the saved presets and the startup profile's, also when that profile fails, and saves it; keeps a branch's saved presets, also none, in later sessions, under the default profile, and with an invalid flag", async () => {
  const dirs = await workspace({
    mcpPresets: {
      db: { mcpServers: { my_db: directServer() } },
      a: { mcpServers: { "x-y": directServer() } },
      extra: { mcpServers: { extra: directServer() } }
    },
    profiles: [
      { name: "q", description: "Q", tools: { deny: ["beta"] }, mcpPresets: ["extra"] },
      { name: "bad", description: "Bad", model: "faux/missing", mcpPresets: ["extra"] }
    ],
    defaultProfile: "q"
  });
  const saving = await host(dirs, {
    extensions: [earlierExtension, fakeMcp().extension],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  await saving.session.prompt("/mcp-presets a");
  await saving.session.prompt("saved");
  const file = saving.session.sessionManager.getSessionFile()!;
  const copy = (from: string) => SessionManager.forkFrom(from, dirs.cwd, dirs.sessionDir);
  // A branch that saved that no preset is active.
  const clearing = await host(dirs, {
    extensions: [earlierExtension, fakeMcp().extension],
    sessionManager: copy(file)
  });
  await clearing.session.prompt("/mcp-presets a");
  await clearing.session.prompt("cleared");
  const cleared = clearing.session.sessionManager.getSessionFile()!;

  /** Waits until Pi registered exactly these MCP tools, and runs a prompt. */
  const run = async (session: AgentSession, mcp: ReturnType<typeof fakeMcp>, tools: string[]) => {
    await expect.poll(() => mcp.registered(session), { timeout: STEP_TIMEOUT_MS }).toEqual(tools);
    await session.prompt("run");
  };

  /**
   * Starts Pi on a copy of a saved session, and returns the events and request tools of its first run, and the events when Pi starts again on that session without flags.
   */
  const start = async (
    options: Pick<HostOptions, "flags" | "mode">,
    tools: string[],
    from = file
  ) => {
    const mcp = fakeMcp();
    const fixture = await host(dirs, {
      ...options,
      extensions: [earlierExtension, mcp.extension],
      sessionManager: copy(from)
    });
    await run(fixture.session, mcp, tools);
    const resumedMcp = fakeMcp();
    const resumed = await host(dirs, {
      extensions: [earlierExtension, resumedMcp.extension],
      sessionManager: SessionManager.open(fixture.session.sessionManager.getSessionFile()!)
    });
    await run(resumed.session, resumedMcp, tools);
    expect([...fixture.errors, ...resumed.errors]).toEqual([]);

    return { events: mcp.events, tools: fixture.requests[0]?.tools, resumed: resumedMcp.events };
  };

  expect(
    await start({ flags: { profile: "bad", "mcp-presets": "db" } }, ["mcp__my_db__ping"])
  ).toEqual({
    events: ["connect my_db"],
    tools: ["alpha", "beta", "mcp__my_db__ping"],
    resumed: ["connect my_db"]
  });
  expect(await start({ mode: "tui" }, ["mcp__x_y__ping"])).toEqual({
    events: ["connect x-y"],
    tools: ["alpha", "mcp__x_y__ping"],
    resumed: ["connect x-y"]
  });
  expect(await start({ mode: "tui" }, [], cleared)).toEqual({
    events: [],
    tools: ["alpha"],
    resumed: []
  });

  for (const flag of ["db,nope", "db,db"]) {
    expect(await start({ flags: { "mcp-presets": flag } }, ["mcp__x_y__ping"])).toEqual({
      events: ["connect x-y"],
      tools: ["alpha", "beta", "mcp__x_y__ping"],
      resumed: ["connect x-y"]
    });
  }

  // A later session of the run, here a resume, keeps its saved presets, also none, and also with --profile.
  const mcp = fakeMcp();
  const fixture = await runtimeHost(dirs, {
    flags: { profile: "q", "mcp-presets": "db" },
    extensions: [earlierExtension, mcp.extension],
    sessionManager: copy(file)
  });
  const session = () => fixture.runtime.session;
  await run(session(), mcp, ["mcp__my_db__ping"]);
  const started = session().sessionFile!;
  await fixture.runtime.switchSession(file);
  await run(session(), mcp, ["mcp__x_y__ping"]);
  await fixture.runtime.switchSession(cleared);
  expect(mcp.events.at(-1)).toBe("close x-y");
  await run(session(), mcp, []);
  // The startup session saved the flag's presets.
  await fixture.runtime.switchSession(started);
  await run(session(), mcp, ["mcp__my_db__ping"]);

  expect(mcp.events).toEqual([
    "connect my_db",
    "close my_db",
    "connect x-y",
    "close x-y",
    "connect my_db"
  ]);
  expect(fixture.requests.map(({ tools }) => tools)).toEqual([
    ["alpha", "mcp__my_db__ping"],
    ["alpha", "mcp__x_y__ping"],
    ["alpha"],
    ["alpha", "mcp__my_db__ping"]
  ]);
  expect([...saving.errors, ...clearing.errors, ...fixture.errors]).toEqual([]);
});

it("restores the branch's MCP presets on tree navigation, also to a branch without presets, reload, fork, and resume, and keeps an unchanged preset server's connection and tools declared across tree navigation, except the profile's deny tools", async () => {
  const dirs = await workspace({
    mcpPresets: {
      db: { mcpServers: { my_db: directServer() } },
      a: { mcpServers: { "x-y": directServer() } },
      blk: { mcpServers: { blocked: directServer() } }
    },
    profiles: [{ name: "guard", description: "Guard", tools: { deny: ["mcp__blocked__*"] } }]
  });
  const mcp = fakeMcp();
  const fixture = await runtimeHost(dirs, {
    extensions: [earlierExtension, mcp.extension],
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });
  const session = () => fixture.runtime.session;

  /** Waits until Pi registered exactly the servers' tools, declared or not, then runs a prompt. */
  const run = async (text: string, tools: string[]) => {
    await expect
      .poll(() => mcp.registered(session()), { timeout: STEP_TIMEOUT_MS })
      .toEqual([...tools].sort());
    await session().prompt(text);
  };

  const dbTool = "mcp__my_db__ping";
  const blockedTool = "mcp__blocked__ping";
  const both = [dbTool, "mcp__x_y__ping"];

  await session().prompt("zero");
  const beforePresets = session().sessionManager.getLeafId()!;
  // The selection comes first, so it does not know the preset servers' tools.
  await session().prompt("/profile guard");
  await session().prompt("/mcp-presets db");
  await session().prompt("/mcp-presets a");
  await session().prompt("/mcp-presets blk");
  const withA = session().sessionManager.getLeafId()!;
  await run("one", [...both, blockedTool]);
  await session().prompt("/mcp-presets a");
  const withoutA = session().sessionManager.getLeafId()!;
  await run("two", [dbTool, blockedTool]);
  await expect
    .poll(() => [...mcp.events].sort(), { timeout: STEP_TIMEOUT_MS })
    .toEqual(["close x-y", "connect blocked", "connect my_db", "connect x-y"]);
  const beforeTree = mcp.events.length;

  await session().navigateTree(withA);
  // `db` and `blk` keep their connections, and only `db`'s tool stays declared.
  const active = session().getActiveToolNames();
  expect(active).toContain(dbTool);
  expect(active).not.toContain(blockedTool);
  await run("after tree", [...both, blockedTool]);
  expect(mcp.events.slice(beforeTree)).toEqual(["connect x-y"]);
  await session().reload();
  await run("after reload", [...both, blockedTool]);
  const file = session().sessionFile!;
  await fixture.runtime.fork(withoutA, { position: "at" });
  await run("forked", [dbTool, blockedTool]);
  await fixture.runtime.switchSession(file);
  await run("resumed", [...both, blockedTool]);
  const beforeNoPresets = mcp.events.length;
  await session().navigateTree(beforePresets);
  await expect
    .poll(() => mcp.events.slice(beforeNoPresets).sort(), { timeout: STEP_TIMEOUT_MS })
    .toEqual(["close blocked", "close my_db", "close x-y"]);
  await run("no presets", []);

  expect(mcpTools(fixture.requests)).toEqual([[], both, [dbTool], both, both, [dbTool], both, []]);
  expect(fixture.errors).toEqual([]);
});

it("appends one profile-change notice per changed run across transitions, idle switches, reloads, unavailable runs, and tree navigation", async () => {
  const dirs = await workspace({ profiles: [plan, build, focus] });
  const noticeEntries = (session: AgentSession) =>
    session.sessionManager
      .getBranch()
      .flatMap((entry) =>
        entry.type === "custom_message" && entry.customType === NOTICE_MESSAGE
          ? [{ content: entry.content, details: entry.details, display: entry.display }]
          : []
      );

  const fixture = await host(dirs, {
    projectTrusted: true,
    sessionManager: SessionManager.create(dirs.cwd, dirs.sessionDir)
  });

  // First run adds no notice even after a switch.
  await fixture.session.prompt("/profile plan");
  await fixture.session.prompt("first");
  expect(noticeEntries(fixture.session)).toEqual([]);

  // Idle switches coalesce to one net transition, and a cycle back to the same profile adds none.
  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("/profile plan");
  await fixture.session.prompt("same again");
  expect(noticeEntries(fixture.session)).toEqual([]);

  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("/profile focus");
  await fixture.session.prompt("coalesced switch");
  const afterSwitch = noticeEntries(fixture.session);
  expect(afterSwitch).toHaveLength(1);
  expect(afterSwitch[0]).toMatchObject({
    details: {
      kind: "switched",
      from: { name: "plan", scope: "global" },
      to: { name: "focus", scope: "global" }
    },
    display: true
  });
  expect(afterSwitch[0]?.content).toContain("focus (Focus)");
  expect(fixture.requests.at(-1)?.texts).toContain(afterSwitch[0]?.content);

  // Clearing emits a cleared notice; reapplying emits a set notice.
  await fixture.session.prompt("/profile clear");
  await fixture.session.prompt("cleared");
  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("set");
  expect(noticeEntries(fixture.session).map(({ details }) => details)).toEqual([
    {
      kind: "switched",
      from: { name: "plan", scope: "global" },
      to: { name: "focus", scope: "global" }
    },
    { kind: "cleared", from: { name: "focus", scope: "global" } },
    { kind: "set", to: { name: "build", scope: "global" } }
  ]);

  // Removing the active profile from settings and reloading produces an unavailable notice; restoring it produces a set notice.
  await writeFile(
    join(dirs.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-profiles": { profiles: [plan, focus] } })
  );
  await fixture.session.reload();
  await fixture.session.prompt("now unavailable");
  await writeFile(
    join(dirs.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-profiles": { profiles: [plan, build, focus] } })
  );
  await fixture.session.reload();
  await fixture.session.prompt("restored");

  // Same-name profile across global and project scopes qualifies both scopes in the notice.
  await writeFile(
    join(dirs.cwd, ".pi", "settings.json"),
    JSON.stringify({
      "ext.pi-profiles": { profiles: [{ name: "build", description: "Project build" }] }
    })
  );
  await fixture.session.reload();
  await fixture.session.prompt("/profile build");
  await fixture.session.prompt("project scope");

  const tail = noticeEntries(fixture.session).slice(-3);
  expect(tail).toMatchObject([
    {
      details: { kind: "unavailable", from: { name: "build", scope: "global" } },
      display: true
    },
    {
      details: { kind: "set", to: { name: "build", scope: "global" } },
      display: true
    },
    {
      details: {
        kind: "switched",
        from: { name: "build", scope: "global" },
        to: { name: "build", scope: "project" }
      },
      display: true
    }
  ]);
  expect(tail[0]?.content).toContain("build");
  expect(tail[1]?.content).toContain("build (Build)");
  expect(tail[2]?.content).toContain("build (global) to build (project) (Project build)");

  // Navigating to the first run's user prompt returns to a branch with no prior run, so the next run adds no notice.
  const firstUser = fixture.session.sessionManager
    .getEntries()
    .find((entry) => entry.type === "message" && entry.message.role === "user");
  expect(firstUser).toBeDefined();
  await fixture.session.navigateTree(firstUser!.id);
  await fixture.session.prompt("/profile focus");
  await fixture.session.prompt("new first run on branch");
  expect(noticeEntries(fixture.session)).toEqual([]);

  // When a branch's first run has an unavailable selection, pi-profiles.run records that it ran without a profile so restoring the profile emits a set notice on the next run.
  const unavailableDirs = await workspace({ profiles: [plan] });
  const unavailable = await host(unavailableDirs, {
    sessionManager: SessionManager.create(unavailableDirs.cwd, unavailableDirs.sessionDir)
  });
  await unavailable.session.prompt("/profile plan");
  await writeFile(
    join(unavailableDirs.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-profiles": { profiles: [] } })
  );
  await unavailable.session.reload();
  await unavailable.session.prompt("first run while unavailable");
  expect(noticeEntries(unavailable.session)).toEqual([]);
  await writeFile(
    join(unavailableDirs.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-profiles": { profiles: [plan] } })
  );
  await unavailable.session.reload();
  await unavailable.session.prompt("second run after restore");
  const restoredNotices = noticeEntries(unavailable.session);
  expect(restoredNotices).toMatchObject([
    {
      details: { kind: "set", to: { name: "plan", scope: "global" } },
      display: true
    }
  ]);
  expect(restoredNotices[0]?.content).toContain("plan (Plan)");

  expect([...fixture.errors, ...unavailable.errors]).toEqual([]);
});
