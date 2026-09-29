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
  DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
  type ExtensionFactory
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vite-plus/test";

import nestedInstructions from "../index.ts";
import { fixture } from "./fixture.ts";
import { readType } from "./ledger.ts";
import { noticeType } from "./notices.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.unstubAllEnvs();
});

async function host(responses: FauxResponseFactory[], before: ExtensionFactory[] = []) {
  const fs = await fixture();
  cleanup.push(fs.dispose);
  const agentDir = path.join(fs.root, "agent");
  await mkdir(agentDir);
  await fs.write("AGENTS.md", "NATIVE ROOT RULES");
  await fs.write("pkg/AGENTS.md", "AUTO PARENT RULES");
  await fs.write("pkg/deep/AGENTS.md", "DIRECT CHILD RULES");
  await fs.write("pkg/deep/file.ts", "decoy/AGENTS.md in tool output");
  await fs.write("decoy/AGENTS.md", "DO NOT FOLLOW OUTPUT PATHS");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  settingsManager.setProjectTrusted(true);
  const resourceLoader = new DefaultResourceLoader({
    cwd: fs.cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
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
    tools: ["read", "bash"]
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
  const h = await host([
    (context) => {
      expect(getCurrentSystemPrompt(context.messages)).toContain("NATIVE ROOT RULES");

      return fauxAssistantMessage([
        fauxToolCall("read", { path: "pkg/deep/file.ts" }, { id: "file" }),
        fauxToolCall("bash", { command: "cat pkg/deep/AGENTS.md" }, { id: "instructions" })
      ]);
    },
    (context) => {
      requests.push(JSON.stringify(context.messages));

      return fauxAssistantMessage("done");
    }
  ]);
  expect(h.session.extensionRunner.getMessageRenderer(noticeType)).toBeUndefined();
  await h.session.prompt("Run the batch");
  expect(h.errors).toEqual([]);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain("AUTO PARENT RULES");
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
  await h.fs.write("pkg/AGENTS.md", "CHANGED PARENT RULES");
  await h.session.reload();
  expect(count()).toBe(2);
  expect(h.errors).toEqual([]);
  expect(
    h.session.messages.some(
      (message) =>
        message.role === "custom" &&
        typeof message.content === "string" &&
        message.content.includes("CHANGED PARENT RULES")
    )
  ).toBe(true);
});
