import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools
} from "@earendil-works/pi-ai";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { expect, it } from "vite-plus/test";

import smartCompact from "../index.ts";
import { sdkSessionFixture } from "./sdk-session.ts";

const section = (config: unknown) => JSON.stringify({ "ext.pi-smart-compact": config });
const route = (provider: string) =>
  section({
    rules: [{ match: "^compact-settings/", model: `${provider}/summary`, thinkingLevel: "off" }]
  });

// Both scopes share readSection (src/config.ts), so each rejected section appears in one participating scope.
const rejected = [
  { failure: "null section", config: null },
  { failure: "missing match", config: { rules: [{ model: "compact-global/summary" }] } },
  { failure: "invalid regex", config: { rules: [{ match: "(" }] } },
  { failure: "malformed model", config: { rules: [{ match: "", model: "model-only" }] } },
  {
    failure: "invalid thinking level",
    config: { rules: [{ match: "", thinkingLevel: "automatic" }] }
  },
  { failure: "invalid manual flag", config: { applyToManual: "true" } },
  { failure: "invalid automatic flag", config: { applyToAuto: null } },
  { failure: "empty focus path", config: { compactionInstructionsFile: "   " } },
  { failure: "unknown key", config: { unknown: true } },
  { failure: "status step below the minimum", config: { statusStep: 49_999 } }
].map(({ failure, config }, index) =>
  index % 2
    ? { scope: `global ${failure}`, projectTrusted: true, global: section(config) }
    : { scope: `trusted project ${failure}`, projectTrusted: true, project: section(config) }
);

it.each<{
  scope: string;
  projectTrusted: boolean;
  global?: string;
  project?: string;
  expectedProvider?: string;
  details?: object;
}>([
  { scope: "untrusted project", projectTrusted: false, expectedProvider: "compact-global" },
  { scope: "trusted project", projectTrusted: true, expectedProvider: "compact-project" },
  { scope: "malformed trusted project", projectTrusted: true, project: "{invalid" },
  {
    scope: "bare first match",
    projectTrusted: false,
    global: section({
      rules: [
        { match: "^other/", model: "compact-project/summary", thinkingLevel: "off" },
        { match: "/active$" },
        { match: "", model: "compact-global/summary", thinkingLevel: "off" }
      ]
    }),
    expectedProvider: "compact-settings",
    details: { scheduled: true }
  },
  {
    scope: "unmerged first match",
    projectTrusted: false,
    global: section({
      rules: [
        { match: "^compact-settings/", model: "compact-global/summary" },
        { match: "", model: "compact-project/summary", thinkingLevel: "high" }
      ]
    }),
    expectedProvider: "compact-global",
    details: { scheduled: true, modelOverride: "compact-global/summary", thinkingLevel: "off" }
  },
  ...rejected
])(
  "routes requested compaction only through valid participating settings: $scope",
  async ({
    projectTrusted,
    global: globalSettings = route("compact-global"),
    project: projectSettings = route("compact-project"),
    expectedProvider,
    details
  }) => {
    const active = fauxProvider({ provider: "compact-settings", models: [{ id: "active" }] });
    const global = fauxProvider({ provider: "compact-global", models: [{ id: "summary" }] });
    const project = fauxProvider({ provider: "compact-project", models: [{ id: "summary" }] });
    const summaryProviders: string[] = [];
    let mainRequests = 0;
    let workCalls = 0;
    active.setResponses(
      Array.from({ length: 6 }, () => (context, _options, _state, model) => {
        if (getCurrentTools(context.messages).length === 0) {
          summaryProviders.push(model.provider);

          return fauxAssistantMessage("SETTINGS_CHECKPOINT");
        }

        mainRequests++;

        if (mainRequests === 1)
          return fauxAssistantMessage([fauxToolCall("fixture_work", {})], {
            stopReason: "toolUse"
          });
        if (mainRequests === 2)
          return fauxAssistantMessage(
            [fauxToolCall("compact", {}), fauxToolCall("fixture_work", {})],
            { stopReason: "toolUse" }
          );

        return fauxAssistantMessage("Finished");
      })
    );
    for (const provider of [global, project])
      provider.setResponses([
        (_context, _options, _state, model) => {
          summaryProviders.push(model.provider);

          return fauxAssistantMessage("SETTINGS_CHECKPOINT");
        }
      ]);
    const fixture = await sdkSessionFixture([
      smartCompact,
      (pi) => {
        for (const provider of [active, global, project]) pi.registerProvider(provider.provider);
        pi.registerTool({
          name: "fixture_work",
          label: "Fixture work",
          description: "Offline work for compaction",
          parameters: Type.Object({}),
          async execute() {
            workCalls++;

            return {
              content: [
                { type: "text", text: workCalls === 1 ? "OLD_WORK ".repeat(3000) : "Recent work." }
              ],
              details: undefined
            };
          }
        });
      }
    ]);

    try {
      await writeFile(join(fixture.agentDir, "settings.json"), globalSettings);
      await mkdir(join(fixture.cwd, CONFIG_DIR_NAME), { recursive: true });
      await writeFile(join(fixture.cwd, CONFIG_DIR_NAME, "settings.json"), projectSettings);
      const { session } = fixture;
      session.settingsManager.setProjectTrusted(projectTrusted);
      session.settingsManager.applyOverrides({
        compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 }
      });
      await session.modelRuntime.refresh({ allowNetwork: false });
      await session.setModel(active.getModel());
      await fixture.bind();
      await session.prompt("Do the work, compact, and finish.");

      expect(mainRequests).toBe(3);
      expect(summaryProviders).toEqual(expectedProvider ? [expectedProvider] : []);
      const branch = session.sessionManager.getBranch();
      expect(branch.filter((entry) => entry.type === "compaction")).toHaveLength(
        expectedProvider ? 1 : 0
      );
      const results = branch.flatMap((entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "compact"
          ? [entry.message]
          : []
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.isError).toBe(expectedProvider === undefined);
      if (details) expect(results[0]?.details).toEqual(details);
      if (expectedProvider === undefined)
        expect(results[0]).toHaveProperty(
          "content.0.text",
          expect.stringContaining("invalid or unreadable settings")
        );
    } finally {
      await fixture.dispose();
    }
  }
);
