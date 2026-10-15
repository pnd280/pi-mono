import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { expect, it, vi } from "vite-plus/test";

import smartCompact from "../src/index.ts";
import { summaryModelEntryType } from "../src/summary-model-entry.ts";
import { sdkSessionFixture } from "./sdk-session.ts";

it.each([
  { name: "configured virtual model", selectedVirtual: false, outcome: "success" },
  { name: "selected virtual conversation model", selectedVirtual: true, outcome: "success" },
  { name: "rejected route", selectedVirtual: false, outcome: "rejection" },
  { name: "cancelled route", selectedVirtual: false, outcome: "cancellation" }
])("virtual compaction: $name", async ({ selectedVirtual, outcome }) => {
  const fixture = await sdkSessionFixture([smartCompact]);
  const { session, agentDir } = fixture;

  try {
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        "ext.pi-smart-compact": {
          // A virtual conversation model matches its own ID, not the routed physical model.
          rules: [
            selectedVirtual
              ? { match: "^compact-virtual/router$", thinkingLevel: "low" }
              : {
                  match: "^compact-virtual/main$",
                  model: "compact-virtual/router",
                  thinkingLevel: "low"
                }
          ],
          applyToManual: true
        }
      })
    );
    const faux = fauxProvider({
      provider: "compact-virtual",
      models: [
        { id: "main", reasoning: true },
        { id: "summary", reasoning: true, maxTokens: 128 }
      ]
    });
    const summaryModel = faux.getModel("summary");
    if (!summaryModel) throw new Error("Missing summary model");
    const route = vi.fn<Parameters<typeof session.modelRuntime.registerVirtualModel>[0]["route"]>(
      async () => {
        // Cross an asynchronous routing boundary before rejecting or cancelling.
        await Promise.resolve();
        if (outcome === "rejection") throw new Error("Summary route rejected");
        if (outcome === "cancellation") session.abortCompaction();

        return { model: summaryModel, thinkingLevel: "off" };
      }
    );
    session.modelRuntime.registerNativeProvider(faux.provider);
    session.modelRuntime.registerVirtualModel({
      provider: "compact-virtual",
      id: "router",
      name: "Summary router",
      thinkingLevels: ["low", "high"],
      route
    });
    await session.modelRuntime.refresh({ allowNetwork: false });
    const model = session.modelRuntime.getModel(
      "compact-virtual",
      selectedVirtual ? "router" : "main"
    );
    if (!model) throw new Error("Missing fixture model");
    await session.setModel(model);
    session.setThinkingLevel("high");
    session.settingsManager.applyOverrides({
      compaction: { enabled: false, reserveTokens: 512, keepRecentTokens: 256 },
      retry: { enabled: false }
    });
    await fixture.bind();
    const stream = vi.spyOn(faux.provider, "streamSimple");
    faux.setResponses([fauxAssistantMessage("VIRTUAL_CHECKPOINT")]);
    session.sessionManager.appendMessage({
      role: "user",
      content: "OLD_PAYLOAD ".repeat(1000),
      timestamp: Date.now()
    });
    session.sessionManager.appendMessage(fauxAssistantMessage("Finished work."));
    session.sessionManager.appendMessage({
      role: "user",
      content: "CURRENT_REQUEST ".repeat(100),
      timestamp: Date.now()
    });
    session.refreshContext();
    const originalStream = session.agent.streamFunction;
    const originalBranch = session.sessionManager.getBranch();
    const originalMessages = [...session.agent.state.messages];

    if (outcome === "success") {
      expect((await session.compact()).summary).toBe("VIRTUAL_CHECKPOINT");
      expect(stream).toHaveBeenCalledOnce();
      expect(stream.mock.calls[0]?.[0].id).toBe("summary");
      expect(stream.mock.calls[0]?.[2]?.reasoning).toBeUndefined();
      expect(stream.mock.calls[0]?.[2]?.maxTokens).toBe(128);
      expect(session.sessionManager.getBranch().at(-2)).toMatchObject({
        type: "custom",
        customType: summaryModelEntryType,
        data: { model: "compact-virtual/router", thinkingLevel: "low", trigger: "manual" }
      });
    } else {
      await expect(session.compact()).rejects.toThrow(
        outcome === "rejection" ? "Summary route rejected" : /cancelled|aborted/i
      );
      expect(session.sessionManager.getBranch()).toEqual(originalBranch);
      expect(session.agent.state.messages).toEqual(originalMessages);
      expect(session.isCompacting).toBe(false);
      if (outcome === "rejection") expect(stream).not.toHaveBeenCalled();
      else expect(route.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    }

    expect(route).toHaveBeenCalledOnce();
    expect(route.mock.calls[0]?.[0].thinkingLevel).toBe("low");
    expect(route.mock.calls[0]?.[0].reason).toBe("direct");
    expect(route.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(session.agent.streamFunction).toBe(originalStream);
    expect(session.model).toBe(model);
    expect(session.thinkingLevel).toBe("high");
  } finally {
    await fixture.dispose();
  }
});
