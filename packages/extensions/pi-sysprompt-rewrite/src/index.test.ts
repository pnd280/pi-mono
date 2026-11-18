import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider, getCurrentSystemPrompt } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager
} from "@earendil-works/pi-coding-agent";
import { isolateEnvironment } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import syspromptRewrite from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});

const settings = (rules: unknown[]) => JSON.stringify({ "ext.pi-sysprompt-rewrite": { rules } });

it("rewrites prompt sections and later section patches from global rules only, without changing the saved session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-sysprompt-rewrite-test-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir);
  await writeFile(
    join(agentDir, "settings.json"),
    settings([
      // Without the m flag, ^ and $ only match if rules see the section body without its tags.
      { match: "^MARK-(\\d)$", replace: "SEEN-$1", sections: ["note"] },
      { match: "SEEN-", replace: "CHAINED-" }
    ])
  );
  await writeFile(
    join(cwd, ".pi", "settings.json"),
    settings([{ match: "\\d", replace: "PROJECT" }])
  );
  isolateEnvironment(directory);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  settingsManager.setProjectTrusted(true);
  let turn = 0;
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
      (pi) => {
        // A changed section on the second prompt makes Pi add a section patch to the transcript.
        pi.on("before_agent_start", (event) => {
          turn += 1;
          event.systemPromptOptions.sections.note = `MARK-${turn}`;
          event.systemPromptOptions.sections.other = "MARK-9";
        });
      },
      syspromptRewrite
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);

  const requests: string[] = [];
  const faux = fauxProvider({ provider: "faux", models: [{ id: "test" }] });
  faux.setResponses(
    Array.from({ length: 2 }, () => (context: { messages: { role: string }[] }) => {
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
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    model: faux.models[0],
    thinkingLevel: "off",
    sessionManager: SessionManager.inMemory(cwd),
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

  await session.prompt("first");
  await session.prompt("second");

  expect(requests).toHaveLength(2);
  expect(requests[0]).toContain("<note>\nCHAINED-1\n</note>");
  expect(requests[1]).toContain("<note>\nCHAINED-2\n</note>");
  expect(requests[1]).toContain("<other>\nMARK-9\n</other>");

  const saved = session.sessionManager
    .getBranch()
    .flatMap((entry) =>
      entry.type === "message" && entry.message.role === "system"
        ? [entry.message.sections?.note]
        : []
    );
  expect(saved).toEqual(["<note>\nMARK-1\n</note>", "<note>\nMARK-2\n</note>"]);
  expect(errors).toEqual([]);
});
