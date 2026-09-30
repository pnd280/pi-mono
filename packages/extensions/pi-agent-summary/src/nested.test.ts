import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { zeroUsage } from "@pi-mono/libs/validation/provider";
import { expect, it } from "vite-plus/test";

import agentSummary from "./index.ts";
import { summaryEntryType, summarySchema } from "./summary.ts";

it("counts nested execution once and excludes child usage while retaining the selected virtual identity", async () => {
  const fixture = await hostFixture([
    agentSummary,
    createCodemodeExtension({ mode: "on" }),
    (pi) => {
      pi.registerTool({
        name: "usage",
        label: "Usage",
        description: "Offline nested usage",
        parameters: Type.Object({}),
        async execute() {
          return {
            content: [{ type: "text", text: "child" }],
            details: undefined,
            usage: { ...zeroUsage(), output: 9000, totalTokens: 9000 }
          };
        }
      });
    }
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "summary-nested", models: [{ id: "physical" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    session.modelRuntime.registerVirtualModel({
      provider: "summary-nested",
      id: "router",
      name: "Router",
      route: () => ({ model: faux.getModel(), thinkingLevel: "off" })
    });
    await session.modelRuntime.refresh({ allowNetwork: false });
    const router = session.modelRuntime.getModel("summary-nested", "router");
    if (!router) throw new Error("Missing router");
    await session.setModel(router);
    session.setThinkingLevel("off");
    session.setActiveToolsByName([...session.getActiveToolNames(), "codemode"]);
    const responses = [
      fauxAssistantMessage([
        fauxToolCall("codemode", {
          code: 'await tools.write({path:"created.txt",content:"created\\n"}); await tools.bash({command:"false"}).catch(() => {}); await tools.usage({}); text("done");'
        })
      ]),
      fauxAssistantMessage("done")
    ];
    faux.setResponses(responses);
    await session.prompt("Run nested work");
    await session.waitForIdle();
    const entries = session.sessionManager
      .getBranch()
      .filter((entry) => entry.type === "custom" && entry.customType === summaryEntryType);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    if (entry?.type !== "custom") throw new Error("Missing summary");
    const summary = summarySchema.parse(entry.data);
    expect(summary).toMatchObject({
      bashCalls: 1,
      model: { provider: "summary-nested", id: "router", thinkingLevel: "off" },
      files: [{ path: "created.txt", status: "available", added: 1, removed: 0 }]
    });
    const messages = session.sessionManager
      .getBranch()
      .flatMap((saved) => (saved.type === "message" ? [saved.message] : []));
    const assistantTokens = messages.reduce(
      (total, message) => total + (message.role === "assistant" ? message.usage.output : 0),
      0
    );
    expect(assistantTokens).toBeGreaterThan(0);
    expect(summary.throughput?.outputTokens).toBe(assistantTokens);
    expect(messages.find((message) => message.role === "toolResult")?.usage?.output).toBe(9000);
    expect(JSON.stringify(session.sessionManager.buildSessionContext().messages)).not.toContain(
      summaryEntryType
    );
  } finally {
    await fixture.dispose();
  }
});
