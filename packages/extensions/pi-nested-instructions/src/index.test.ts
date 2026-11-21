import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentSystemPrompt,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionFactory,
  type SessionEntry
} from "@earendil-works/pi-coding-agent";
import { isolateEnvironment } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import nestedInstructions from "../index.ts";
import { readType } from "./ledger.ts";
import { decodeNotice, noticeEntry, noticeType } from "./notices.ts";
import { listingType } from "./skill-listings.ts";
import { fixture } from "./test-fixture.ts";

const parentRules = "AUTO PARENT RULES\n\n  indented line\n\ttabbed line\n";

function noticesIn(entries: SessionEntry[]) {
  return entries.flatMap((entry) => {
    if (entry.type !== "custom_message" || entry.customType !== noticeType) return [];
    const { notice, body } = decodeNotice(entry);

    return [{ action: notice?.action, displayPath: notice?.displayPath, body }];
  });
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.unstubAllEnvs();
});

function listingsIn(entries: SessionEntry[]) {
  return entries.flatMap((entry) =>
    entry.type === "custom_message" && entry.customType === listingType ? [entry.details] : []
  );
}

function skillCommands(pi: ExtensionAPI) {
  return pi.getCommands().filter((command) => command.source === "skill");
}

async function host(
  responses: FauxResponseFactory[],
  before: ExtensionFactory[] = [],
  trusted = true,
  nativeSkills: string[] = []
) {
  const fs = await fixture();
  cleanup.push(fs.dispose);
  const agentDir = path.join(fs.root, "agent");
  await mkdir(agentDir);
  await fs.write("../agent/AGENTS.md", "NATIVE GLOBAL RULES");
  await fs.write("../AGENTS.md", "NATIVE ANCESTOR RULES");
  await fs.write("AGENTS.md", "NATIVE ROOT RULES");
  await fs.write("pkg/AGENTS.md", parentRules);
  await fs.write("pkg/deep/AGENTS.md", "DIRECT CHILD RULES");
  await fs.write("pkg/deep/file.ts", "decoy/AGENTS.md in tool output");
  await fs.write("decoy/AGENTS.md", "DO NOT FOLLOW OUTPUT PATHS");
  await fs.write(
    "pkg/.agents/skills/deploy/SKILL.md",
    "---\nname: deploy\ndescription: NESTED DEPLOY SKILL\n---\n"
  );
  await fs.write(
    "pkg/.pi/skills/release/SKILL.md",
    "---\nname: release\ndescription: HIDDEN NESTED SKILL\ndisable-model-invocation: true\n---\n"
  );
  // A nested skill folder that no other test's tool call reaches; a test can load its skill without the extension.
  await fs.write(
    "other/.agents/skills/native/SKILL.md",
    "---\nname: native\ndescription: NATIVE SKILL BELOW NESTED FOLDER\n---\n"
  );
  isolateEnvironment(fs.root);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  settingsManager.setProjectTrusted(trusted);
  const resourceLoader = new DefaultResourceLoader({
    cwd: fs.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    additionalSkillPaths: nativeSkills.map((skill) => path.join(fs.cwd, skill)),
    noThemes: true,
    noPromptTemplates: true,
    extensionFactories: [...before, nestedInstructions]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  const faux = fauxProvider({ provider: "faux", models: [{ id: "nested-test" }] });
  faux.setResponses(responses);
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: path.join(agentDir, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({
    cwd: fs.cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: faux.models[0],
    thinkingLevel: "off",
    sessionManager: fs.manager,
    tools: ["read", "bash", "codemode"]
  });
  cleanup.push(async () => {
    session.dispose();
  });
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode: "print",
    onError: (error) => {
      errors.push(error);
    }
  });

  return { fs, session, errors };
}

it("does not interrupt sibling tools and delivers only unseen instructions before the next request", async () => {
  const requests: string[] = [];
  const h = await host(
    [
      (context) => {
        const systemPrompt = getCurrentSystemPrompt(context.messages);
        for (const rules of ["NATIVE GLOBAL RULES", "NATIVE ANCESTOR RULES", "NATIVE ROOT RULES"])
          expect(systemPrompt).toContain(rules);

        return fauxAssistantMessage([
          fauxToolCall("read", { path: "pkg/deep/file.ts" }, { id: "file" }),
          fauxToolCall("bash", { command: "cat pkg/deep/AGENTS.md" }, { id: "instructions" })
        ]);
      },
      (context) => {
        requests.push(JSON.stringify(context.messages));

        return fauxAssistantMessage("done");
      }
    ],
    [
      (pi) => {
        pi.on("turn_end", (event, ctx) => {
          if (
            event.message.role !== "assistant" ||
            !event.message.content.some((part) => part.type === "toolCall")
          )
            return;

          return {
            entries: [
              ...event.entries,
              noticeEntry(
                path.join(ctx.cwd, "pkg"),
                {
                  action: "loaded",
                  path: path.join(ctx.cwd, "pkg/AGENTS.md"),
                  content: "PRIOR BOUNDARY RULES"
                },
                ctx.cwd
              )
            ]
          };
        });
      }
    ]
  );
  await h.session.prompt("Run the batch");
  expect(h.errors).toEqual([]);
  expect(requests[0]?.match(/PRIOR BOUNDARY RULES/g)).toHaveLength(1);
  expect(requests[0]).not.toContain("AUTO PARENT RULES");
  expect(requests[0]?.match(/DIRECT CHILD RULES/g)).toHaveLength(1);
  expect(requests[0]).not.toContain("DO NOT FOLLOW OUTPUT PATHS");
  const entries = h.fs.manager.getBranch();
  expect(
    entries.filter((entry) => entry.type === "custom" && entry.customType === readType)
  ).toHaveLength(1);
  const loaded = entries.filter(
    (entry) => entry.type === "custom_message" && entry.customType === noticeType
  );
  expect(loaded).toHaveLength(1);
  const results = entries.filter(
    (entry) => entry.type === "message" && entry.message.role === "toolResult"
  );
  expect(results).toHaveLength(2);
  expect(entries.indexOf(loaded[0]!)).toBeGreaterThan(entries.indexOf(results[1]!));
});

it("marks blocked and invalid read attempts from issued inputs, not tool success", async () => {
  const h = await host(
    [
      () =>
        fauxAssistantMessage([
          fauxToolCall(
            "read",
            { path: "pkg/deep/AGENTS.md", offset: "invalid" },
            { id: "invalid" }
          ),
          fauxToolCall("bash", { command: "head -n 1 pkg/AGENTS.md" }, { id: "blocked" })
        ]),
      () => fauxAssistantMessage("done")
    ],
    [
      (pi) => {
        pi.on("tool_call", () => ({ block: true, reason: "fixture block" }));
      }
    ]
  );
  await h.session.prompt("Attempt reads");
  const entries = h.fs.manager.getBranch();
  expect(
    entries.filter((entry) => entry.type === "custom" && entry.customType === readType)
  ).toHaveLength(2);
  expect(
    entries.filter((entry) => entry.type === "custom_message" && entry.customType === noticeType)
  ).toHaveLength(0);
  expect(h.errors).toEqual([]);
});

it.each([
  { blocked: false, direct: false },
  { blocked: true, direct: false },
  { blocked: false, direct: true },
  { blocked: true, direct: true }
])(
  "discovers nested inputs with direct-only suppression (blocked: $blocked, direct sibling: $direct)",
  async ({ blocked, direct }) => {
    const requests: string[] = [];
    const h = await host(
      [
        () =>
          fauxAssistantMessage([
            fauxToolCall(
              "codemode",
              {
                code: 'await Promise.allSettled([tools.read({path:"pkg/deep/AGENTS.md"}), tools.bash({command:"cat bash/file.ts"}), tools.read({path:"invalid/AGENTS.md", offset:"invalid"})]); text("filtered");'
              },
              { id: "parent" }
            ),
            ...(direct
              ? [fauxToolCall("read", { path: "pkg/deep/AGENTS.md" }, { id: "direct" })]
              : [])
          ]),
        (context) => {
          requests.push(JSON.stringify(context.messages));

          return fauxAssistantMessage("done");
        }
      ],
      [
        createCodemodeExtension({ mode: "on" }),
        (pi) => {
          pi.on("tool_call", (event) =>
            blocked && event.parentToolCallId ? { block: true, reason: "fixture" } : undefined
          );
        }
      ]
    );
    await h.fs.write("bash/AGENTS.md", "BASH CHILD RULES");
    await h.fs.write("invalid/AGENTS.md", "INVALID CHILD RULES");
    await h.session.prompt("Discover nested scopes");
    expect(h.errors).toEqual([]);
    for (const rules of [
      "AUTO PARENT RULES",
      "DIRECT CHILD RULES",
      "BASH CHILD RULES",
      "INVALID CHILD RULES"
    ])
      expect(requests[0]).toContain(rules);
    expect(requests[0]).not.toContain("DO NOT FOLLOW OUTPUT PATHS");
    const branch = h.fs.manager.getBranch();
    expect(
      branch.flatMap((entry) =>
        entry.type === "custom" && entry.customType === readType ? [entry.data] : []
      )
    ).toMatchObject(
      direct ? [{ path: path.join(h.fs.cwd, "pkg/deep/AGENTS.md"), toolCallId: "direct" }] : []
    );
    const loaded = [
      { action: "loaded", displayPath: "bash/AGENTS.md", body: "BASH CHILD RULES" },
      { action: "loaded", displayPath: "invalid/AGENTS.md", body: "INVALID CHILD RULES" },
      { action: "loaded", displayPath: "pkg/AGENTS.md", body: parentRules },
      ...(direct
        ? []
        : [{ action: "loaded", displayPath: "pkg/deep/AGENTS.md", body: "DIRECT CHILD RULES" }])
    ];
    expect(noticesIn(branch)).toEqual(loaded);
    expect(
      branch.filter((entry) => entry.type === "message" && entry.message.role === "toolResult")
    ).toHaveLength(direct ? 2 : 1);
    await h.session.reload();
    expect(noticesIn(h.fs.manager.getBranch())).toEqual(loaded);
  }
);

it("refreshes changed scopes through a real host reload without repeating unchanged direct reads", async () => {
  const h = await host([
    () =>
      fauxAssistantMessage([
        fauxToolCall("read", { path: "pkg/deep/AGENTS.md", limit: 1 }, { id: "direct" })
      ]),
    () => fauxAssistantMessage("done")
  ]);
  await h.session.prompt("Read instructions");
  const count = () =>
    h.fs.manager
      .getBranch()
      .filter((entry) => entry.type === "custom_message" && entry.customType === noticeType).length;
  expect(count()).toBe(1);
  await h.session.reload();
  expect(count()).toBe(1);
  const changedRules = "CHANGED PARENT RULES\n  kept indentation\n\n";
  await h.fs.write("pkg/AGENTS.md", changedRules);
  await h.fs.write("../agent/AGENTS.md", "UPDATED GLOBAL RULES");
  await h.session.reload();
  expect(count()).toBe(2);
  expect(noticesIn(h.fs.manager.getBranch())).toEqual([
    { action: "loaded", displayPath: "pkg/AGENTS.md", body: parentRules },
    { action: "updated", displayPath: "pkg/AGENTS.md", body: changedRules }
  ]);
  expect(h.errors).toEqual([]);
  for (const rules of ["UPDATED GLOBAL RULES", "NATIVE ANCESTOR RULES", "NATIVE ROOT RULES"])
    expect(h.session.systemPrompt).toContain(rules);
  expect(h.session.systemPrompt).not.toContain("CHANGED PARENT RULES");
  expect(
    h.session.messages.some(
      (message) =>
        message.role === "custom" &&
        typeof message.content === "string" &&
        message.content.includes("CHANGED PARENT RULES")
    )
  ).toBe(true);
});

it("registers and lists no nested skill in an untrusted project", async () => {
  const requests: string[] = [];
  let commands: ReturnType<typeof skillCommands> | undefined;
  const h = await host(
    [
      () => fauxAssistantMessage([fauxToolCall("read", { path: "pkg/deep/file.ts" }, { id: "a" })]),
      (context) => {
        requests.push(JSON.stringify(context.messages));

        return fauxAssistantMessage("done");
      }
    ],
    [
      (pi) => {
        pi.on("input", () => {
          commands = skillCommands(pi);
        });
      }
    ],
    false
  );
  await h.session.prompt("Read a nested file");
  expect(h.errors).toEqual([]);
  expect(commands).toEqual([]);
  expect(listingsIn(h.fs.manager.getBranch())).toEqual([]);
  // The nested instructions show that the call reached the directory.
  expect(requests[0]).toContain("AUTO PARENT RULES");
  expect(requests[0]).not.toContain("NESTED DEPLOY SKILL");
});

it("registers nested skills from the first prompt and keeps them out of every request's system prompt", async () => {
  const prompts: (string | undefined)[] = [];
  const commands: ReturnType<typeof skillCommands>[] = [];

  const respond =
    (message: ReturnType<typeof fauxAssistantMessage>): FauxResponseFactory =>
    (context) => {
      prompts.push(getCurrentSystemPrompt(context.messages));

      return message;
    };

  const h = await host(
    [
      respond(fauxAssistantMessage([fauxToolCall("read", { path: "AGENTS.md" }, { id: "a" })])),
      respond(fauxAssistantMessage("done")),
      respond(fauxAssistantMessage("done"))
    ],
    [
      (pi) => {
        pi.on("input", () => {
          commands.push(skillCommands(pi));
        });
      }
    ],
    true,
    // Pi loads this skill without the extension, although it lies in a nested skill folder.
    ["other/.agents/skills/native"]
  );
  await h.session.prompt("First run");
  await h.session.prompt("Later run");
  expect(h.errors).toEqual([]);
  expect(new Map(commands[0]?.map((command) => [command.name, command.sourceInfo.path]))).toEqual(
    new Map([
      ["skill:release", path.join(h.fs.cwd, "pkg/.pi/skills/release/SKILL.md")],
      ["skill:deploy", path.join(h.fs.cwd, "pkg/.agents/skills/deploy/SKILL.md")],
      ["skill:native", path.join(h.fs.cwd, "other/.agents/skills/native/SKILL.md")]
    ])
  );
  // Two requests in the first run, one in the later run.
  expect(prompts).toHaveLength(3);

  for (const prompt of prompts) {
    expect(prompt).toContain("NATIVE ROOT RULES");
    expect(prompt).toContain("NATIVE SKILL BELOW NESTED FOLDER");
    expect(prompt).not.toContain("NESTED DEPLOY SKILL");
  }
});

it("lists a directory's invocable skills once after a tool input reaches it", async () => {
  const requests: string[] = [];

  const respond =
    (message: ReturnType<typeof fauxAssistantMessage>): FauxResponseFactory =>
    (context) => {
      requests.push(JSON.stringify(context.messages));

      return message;
    };

  const read = (id: string) =>
    fauxAssistantMessage([fauxToolCall("read", { path: "pkg/deep/file.ts" }, { id })]);
  const h = await host([
    respond(read("first")),
    respond(read("second")),
    respond(fauxAssistantMessage("done"))
  ]);
  await h.session.prompt("Read a nested file twice");
  expect(h.errors).toEqual([]);
  // Nothing before the first read, one listing after it, and no second listing after the repeated read.
  expect(requests.map((request) => request.match(/NESTED DEPLOY SKILL/g)?.length ?? 0)).toEqual([
    0, 1, 1
  ]);
  expect(listingsIn(h.fs.manager.getBranch())).toMatchObject([
    {
      action: "loaded",
      displayPath: "pkg",
      skills: [{ name: "deploy", description: "NESTED DEPLOY SKILL" }]
    }
  ]);
  expect(requests[2]).toContain(path.join(h.fs.cwd, "pkg/.agents/skills/deploy/SKILL.md"));
  expect(requests[2]).not.toContain("HIDDEN NESTED SKILL");
});
