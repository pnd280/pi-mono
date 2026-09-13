import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import {
  createAssistantMessageEventStream,
  createProvider,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

import { assistantMessage, toolCall } from "../test-fixture.ts";
import { assertFixtureWorkspace } from "./workspace.ts";

type PlannedCall = { name: string; args: Record<string, unknown> };

const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

/** Only these fixed plans execute; prompts never become shell commands or file paths. */
function scenarios(cwd: string): ReadonlyMap<string, readonly PlannedCall[]> {
  const path = (name: string) => join(cwd, name);
  const read = (name: string): PlannedCall => ({
    name: "read",
    args: { path: path(name), limit: 5 }
  });
  const shell = (source: string): PlannedCall => ({
    name: "bash",
    args: { command: `${quote(process.execPath)} -e ${quote(source)}` }
  });

  return new Map([
    [
      "explore",
      [
        read("a.ts"),
        read("b.ts"),
        read("a.ts"),
        read("missing.txt"),
        { name: "ls", args: { path: cwd } }
      ]
    ],
    ["images", [read("a.ts"), read("image.png"), read("b.ts")]],
    [
      "diff",
      [
        {
          name: "write",
          args: { path: path("created.ts"), content: 'export const created = "界😀";\n' }
        },
        {
          name: "edit",
          args: { path: path("a.ts"), edits: [{ oldText: '"before"', newText: '"after"' }] }
        },
        {
          name: "edit",
          args: {
            path: path("b.ts"),
            edits: [
              { oldText: "value2 = 2", newText: "value2 = 200" },
              { oldText: "value70 = 70", newText: "value70 = 700" }
            ]
          }
        }
      ]
    ],
    [
      "output",
      [
        shell(
          'let n = 0; const timer = setInterval(() => { process.stdout.write(("界😀 " + "x".repeat(1024) + "\\n").repeat(256)); if (++n === 6) clearInterval(timer); }, 350);'
        ),
        shell('process.stdout.write("published failure example\\n"); process.exitCode = 7;')
      ]
    ],
    ["cancel", [shell('console.log("Cancel this call with Esc"); setTimeout(() => {}, 30000);')]],
    ["public", [{ name: "display_fixture_read", args: { path: path("a.ts") } }]]
  ]);
}

export default async function displayFixture(pi: ExtensionAPI): Promise<void> {
  const cwd = process.cwd();
  await assertFixtureWorkspace(cwd);
  const plans = scenarios(cwd);

  const stream: ProviderStreams["stream"] = (model, context, options) => {
    const events = createAssistantMessageEventStream();
    const output = {
      ...assistantMessage([], Date.now()),
      api: model.api,
      provider: model.provider,
      model: model.id
    };

    void (async () => {
      try {
        options?.signal?.throwIfAborted();
        let userIndex = context.messages.length - 1;
        while (userIndex >= 0 && context.messages[userIndex]?.role !== "user") userIndex--;
        const user = context.messages[userIndex];
        const prompt =
          user?.role === "user"
            ? (typeof user.content === "string"
                ? user.content
                : user.content
                    .filter((part) => part.type === "text")
                    .map((part) => part.text)
                    .join("\n")
              ).trim()
            : "";
        const plan = plans.get(prompt);
        // Context, not a closure counter, determines completion across reload/replay.
        const completed = context.messages
          .slice(userIndex + 1)
          .some((message) => message.role === "toolResult");
        events.push({ type: "start", partial: output });

        if (plan && !completed) {
          for (const planned of plan) {
            await setTimeout(120, undefined, { signal: options?.signal });
            const contentIndex = output.content.length;
            const call = toolCall(randomUUID(), planned.name, {});
            output.content.push(call);
            events.push({ type: "toolcall_start", contentIndex, partial: output });
            await setTimeout(120, undefined, { signal: options?.signal });
            call.arguments = planned.args;
            events.push({
              type: "toolcall_delta",
              contentIndex,
              delta: JSON.stringify(call.arguments),
              partial: output
            });
            events.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: output });
          }

          output.stopReason = "toolUse";
        } else {
          const text = plan
            ? `Fixture finished: ${prompt}. Inspect the tool rows; failures may be intentional.`
            : `Choose a fixture prompt: ${[...plans.keys()].join(", ")}.`;
          output.content.push({ type: "text", text });
          events.push({ type: "text_start", contentIndex: 0, partial: output });
          events.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
          events.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
          output.stopReason = "stop";
        }

        events.push({ type: "done", reason: output.stopReason, message: output });
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? "aborted" : "error";
        output.errorMessage = error instanceof Error ? error.message : String(error);
        events.push({ type: "error", reason: output.stopReason, error: output });
      } finally {
        events.end();
      }
    })();

    return events;
  };

  pi.registerProvider(
    createProvider({
      id: "display-fixture",
      auth: {
        apiKey: {
          name: "Offline fixture",
          resolve: async () => ({ auth: { apiKey: "offline-fixture" }, source: "fixture" })
        }
      },
      models: [
        {
          id: "scripted",
          name: "Offline display fixture",
          api: "display-fixture",
          provider: "display-fixture",
          baseUrl: "http://localhost.invalid",
          reasoning: false,
          input: ["text", "image"],
          contextWindow: 200000,
          maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }
      ],
      api: { stream, streamSimple: stream }
    })
  );
  pi.registerTool({
    ...createReadToolDefinition(cwd),
    name: "display_fixture_read",
    ...createToolDisplayRenderers("display_fixture_read")
  });
}
