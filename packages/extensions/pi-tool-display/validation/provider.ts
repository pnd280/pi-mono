import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import {
  contentText,
  createProvider,
  fauxToolCall,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureStream } from "@pi-mono/libs/validation/provider";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

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
    ["public", [{ name: "display_fixture_read", args: { path: path("a.ts") } }]],
    [
      "mcp",
      [
        { name: "mcp", args: { connect: "display" } },
        { name: "mcp", args: { describe: "display_echo" } },
        {
          name: "mcp",
          args: { tool: "echo", server: "display", args: { value: "gateway output" } }
        },
        { name: "mcp__display", args: { tool: "image" } },
        { name: "direct_echo", args: { value: "direct output" } },
        {
          name: "mcpScript",
          args: { code: 'emit(await tools.call("display_echo", { value: "script output" }));' }
        },
        { name: "mcp", args: { tool: "fail", server: "display" } },
        { name: "mcp", args: { tool: "large", server: "display" } }
      ]
    ]
  ]);
}

export default async function displayFixture(pi: ExtensionAPI): Promise<void> {
  const cwd = process.cwd();
  await assertFixtureWorkspace(cwd);
  const plans = scenarios(cwd);

  const stream: ProviderStreams["stream"] = (model, context, options) =>
    createFixtureStream({
      model,
      signal: options?.signal,
      async run({ message: output, events, text: appendText }) {
        let userIndex = context.messages.length - 1;
        while (userIndex >= 0 && context.messages[userIndex]?.role !== "user") userIndex--;
        const user = context.messages[userIndex];
        const prompt = user?.role === "user" ? contentText(user.content).trim() : "";
        const plan = plans.get(prompt);
        // Context, not a closure counter, determines completion across reload/replay.
        const completed = context.messages
          .slice(userIndex + 1)
          .some((message) => message.role === "toolResult");

        if (plan && !completed) {
          for (const planned of plan) {
            await setTimeout(120, undefined, { signal: options?.signal });
            const contentIndex = output.content.length;
            const call = fauxToolCall(planned.name, {}, { id: randomUUID() });
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

          return "toolUse";
        } else {
          const text = plan
            ? `Fixture finished: ${prompt}. Inspect the tool rows; failures may be intentional.`
            : `Choose a fixture prompt: ${[...plans.keys()].join(", ")}.`;
          appendText(text);

          return "stop";
        }
      }
    });

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
