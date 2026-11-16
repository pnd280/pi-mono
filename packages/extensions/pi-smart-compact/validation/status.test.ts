import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type FauxResponseStep,
  type Message
} from "@earendil-works/pi-ai";
import type { AgentSession, ContextUsage, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { expect, it } from "vite-plus/test";

import smartCompact from "../index.ts";
import { contextStatusType } from "../src/result.ts";
import { sdkSessionFixture } from "./sdk-session.ts";

const step = 50_000;
// The faux provider counts four characters as one token, so a block is 60,000 tokens: more than one step and less than two.
const block = "WORK ".repeat(48_000);
const work = () =>
  fauxAssistantMessage([fauxToolCall("fixture_work", {})], { stopReason: "toolUse" });

async function statusFixture(
  provider: string,
  models: string[],
  observe: (pi: ExtensionAPI) => void
) {
  const faux = fauxProvider({
    provider,
    models: models.map((id) => ({ id, contextWindow: 1_000_000 }))
  });
  // The observer loads first, so its handlers run before the extension's.
  const fixture = await sdkSessionFixture([
    (pi) => {
      pi.registerProvider(faux.provider);
      pi.registerTool({
        name: "fixture_work",
        label: "Fixture work",
        description: "Offline fixture",
        parameters: Type.Object({}),
        async execute() {
          return { content: [{ type: "text", text: block }], details: undefined };
        }
      });
      observe(pi);
    },
    smartCompact
  ]);
  const { session } = fixture;

  try {
    await writeFile(
      join(fixture.agentDir, "settings.json"),
      JSON.stringify({ "ext.pi-smart-compact": { statusStep: step } })
    );
    await fixture.bind();
  } catch (error) {
    await fixture.dispose();
    throw error;
  }

  return {
    ...fixture,
    faux,
    async select(id: string) {
      const model = faux.getModel(id);
      if (!model) throw new Error(`Missing fixture model ${id}`);
      await session.setModel(model);
    },
    async run(prompt: string, ...responses: FauxResponseStep[]) {
      faux.setResponses(responses);
      await session.prompt(prompt);
      expect(faux.getPendingResponseCount()).toBe(0);
    }
  };
}

/** The branch as its conversation roles, with each context status as `status`. */
function shape(session: AgentSession) {
  return session.sessionManager.getBranch().flatMap((entry) => {
    if (entry.type === "message")
      return entry.message.role === "system" ? [] : [entry.message.role];
    if (entry.type === "custom_message")
      return [entry.customType === contextStatusType ? "status" : "custom"];

    return entry.type === "compaction" ? ["compaction"] : [];
  });
}

function statusTexts(messages: Message[]) {
  return messages.flatMap((message) => {
    if (message.role !== "user" || typeof message.content === "string") return [];

    return message.content.flatMap((part) =>
      part.type === "text" && part.text.startsWith("Context usage: ") ? [part.text] : []
    );
  });
}

it("gives the model each newly passed usage boundary without starting a request", async () => {
  const checks: (ContextUsage | undefined)[] = [];
  const requests: string[][] = [];
  const fixture = await statusFixture("status-snapshot", ["offline"], (pi) => {
    pi.on("before_agent_start", (_event, ctx) => void checks.push(ctx.getContextUsage()));
    pi.on("turn_end", (_event, ctx) => void checks.push(ctx.getContextUsage()));
  });
  const { session, faux } = fixture;

  try {
    await fixture.select("offline");
    // The tool result passes the first boundary, and the long final response passes the second.
    await fixture.run("Do the work.", work(), (context) => {
      requests.push(statusTexts(context.messages));

      return fauxAssistantMessage(block.slice(0, block.length - 40_000));
    });
    expect(faux.state.callCount).toBe(2);
    // Content that arrives between runs passes the third boundary, which the next run reports at its start.
    await session.sendCustomMessage({ customType: "fixture", content: block, display: false });
    await fixture.run("Continue.", (context) => {
      requests.push(statusTexts(context.messages));

      return fauxAssistantMessage("done");
    });
    expect(faux.state.callCount).toBe(3);

    // Checks run at: first run start, tool-call response, final response, second run start, final response.
    expect(checks.map((usage) => Math.floor((usage?.tokens ?? 0) / step))).toEqual([0, 1, 2, 3, 3]);
    const expected = checks.slice(1, 4).map((usage) => `Context usage: ${JSON.stringify(usage)}`);
    expect(shape(session)).toEqual([
      "user",
      "assistant",
      "toolResult",
      "status",
      "assistant",
      "status",
      "custom",
      "user",
      "status",
      "assistant"
    ]);
    expect(requests).toEqual([expected.slice(0, 1), expected]);
  } finally {
    await fixture.dispose();
  }
});

it("reports a boundary once per branch, and again after a compaction or a model change", async () => {
  let compactNext = false;
  const fixture = await statusFixture("status-branch", ["first", "second"], (pi) =>
    pi.on("turn_end", (event) => {
      if (!compactNext) return undefined;
      compactNext = false;

      return {
        entries: [
          ...event.entries,
          { type: "compaction", summary: "FIXTURE_SUMMARY", firstKeptEntryId: null }
        ]
      };
    })
  );
  const { session } = fixture;
  const done = () => fauxAssistantMessage("done");

  try {
    await fixture.select("first");
    await fixture.run("Do the work.", work(), done());
    const reported = ["user", "assistant", "toolResult", "status", "assistant"];
    expect(shape(session)).toEqual(reported);
    // The saved status still covers the boundary after a reload.
    await session.reload();
    await fixture.run("Carry on.", done());
    reported.push("user", "assistant");
    expect(shape(session)).toEqual(reported);

    // Another model counts differently: one status from the old model's count, then one from its own.
    await fixture.select("second");
    await fixture.run("Carry on.", done());
    const ownResponse = session.sessionManager
      .getBranch()
      .filter((entry) => entry.type === "message" && entry.message.role === "assistant")
      .at(-1);
    if (!ownResponse) throw new Error("Missing the second model's response");
    reported.push("user", "status", "assistant");
    const beforeOwnStatus = [...reported];
    reported.push("status");
    expect(shape(session)).toEqual(reported);

    // This tool result passes the second boundary, but its count predates the compaction that another extension adds.
    compactNext = true;
    await fixture.run("Do the work.", work(), done());
    reported.push("user", "assistant", "toolResult", "compaction", "assistant");
    expect(shape(session)).toEqual(reported);

    // After the compaction, the first boundary is new again.
    await fixture.run("Do the work.", work(), done());
    reported.push("user", "assistant", "toolResult", "status", "assistant");
    expect(shape(session)).toEqual(reported);

    // The branch that ends at the second model's first response does not hold the status that followed it, so the next run reports the boundary again.
    await session.navigateTree(ownResponse.id);
    await fixture.run("Carry on.", done());
    expect(shape(session)).toEqual([...beforeOwnStatus, "user", "status", "assistant"]);
  } finally {
    await fixture.dispose();
  }
});
