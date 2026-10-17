import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
  Type
} from "@earendil-works/pi-ai";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import smartCompact from "../index.ts";
import { sdkSessionFixture } from "./sdk-session.ts";

it.each([
  { scope: "untrusted project", projectTrusted: false, expectedProvider: "compact-global" },
  { scope: "trusted project", projectTrusted: true, expectedProvider: "compact-project" },
  { scope: "invalid global", projectTrusted: true, expectedProvider: undefined },
  { scope: "invalid trusted project", projectTrusted: true, expectedProvider: undefined }
])(
  "routes requested compaction only through valid participating settings: $scope",
  async ({ scope, projectTrusted, expectedProvider }) => {
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
      const section = (provider: string) =>
        JSON.stringify({
          "ext.pi-smart-compact": {
            rules: [
              { match: "^compact-settings/", model: `${provider}/summary`, thinkingLevel: "off" }
            ]
          }
        });
      await writeFile(
        join(fixture.agentDir, "settings.json"),
        scope === "invalid global" ? "{invalid" : section("compact-global")
      );
      await mkdir(join(fixture.cwd, CONFIG_DIR_NAME), { recursive: true });
      await writeFile(
        join(fixture.cwd, CONFIG_DIR_NAME, "settings.json"),
        scope === "invalid trusted project" ? "{invalid" : section("compact-project")
      );
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
