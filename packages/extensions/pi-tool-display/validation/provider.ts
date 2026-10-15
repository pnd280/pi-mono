import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import {
  contentText,
  createProvider,
  fauxToolCall,
  getCurrentTools,
  type JsonObject,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import { createReadToolDefinition, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureStream, type FixtureStreamContext } from "@pi-mono/libs/validation/provider";
import { quotePosixShellArgument } from "@pi-mono/utils/shell";
import { createToolDisplayRenderers } from "pi-tool-display/renderers";

import { assertFixtureWorkspace, UNPACED_ENV } from "./workspace.ts";

type PlannedCall = { name: string; args: JsonObject };

/** Pauses keep streaming states visible; unpaced tests still yield between events. */
const pause = (ms: number, signal: AbortSignal | undefined) =>
  setTimeout(process.env[UNPACED_ENV] === "1" ? 0 : ms, undefined, { signal });

/** Summary turns: optional prose starts a new run; turns without prose extend it. */
const SUMMARY_TURNS: readonly { calls: number; text?: string }[] = [
  { calls: 3, text: "Summary fixture: prose before the first run." },
  { calls: 1 },
  { calls: 1 },
  { calls: 1 },
  { calls: 2, text: "Prose before the second run." },
  { calls: 1, text: "Prose before a long-running tail." }
];

/** Only these fixed plans execute; prompts never become shell commands or file paths. */
function scenarios(cwd: string): ReadonlyMap<string, readonly PlannedCall[]> {
  const path = (name: string) => join(cwd, name);
  const read = (name: string): PlannedCall => ({
    name: "read",
    args: { path: path(name), limit: 5 }
  });
  const shell = (source: string): PlannedCall => ({
    name: "bash",
    args: {
      command: `${quotePosixShellArgument(process.execPath)} -e ${quotePosixShellArgument(source)}`
    }
  });

  // Fails until the edit below marks the summary final, then the same command passes.
  const summaryCheck = shell(
    `const fs = require("node:fs"); const file = ${JSON.stringify(path("summary.txt"))}; if (!fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes("final")) { console.error("summary check failed: summary.txt is not final"); process.exitCode = 1; }`
  );

  return new Map([
    [
      "summary",
      [
        read("a/alpha.txt"),
        read("a/beta.txt"),
        summaryCheck,
        { name: "write", args: { path: path("summary.txt"), content: "status: draft\n" } },
        {
          name: "edit",
          args: { path: path("summary.txt"), edits: [{ oldText: "draft", newText: "final" }] }
        },
        summaryCheck,
        read("a/alpha.txt"),
        { name: "ls", args: { path: path("a") } },
        shell(
          "let n = 0; const timer = setInterval(() => { console.log(`tail output ${++n}`); if (n === 16) clearInterval(timer); }, 500);"
        )
      ]
    ],
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
    [
      "scopes",
      [
        { name: "ls", args: { path: cwd } },
        read("a.ts"),
        read("a.ts"),
        { name: "ls", args: { path: path("src") } },
        { name: "grep", args: { pattern: "value", path: path("src/./") } },
        read("src/c.ts"),
        read("src/missing.ts"),
        read("b.ts")
      ]
    ],
    [
      "native-mixed",
      [
        { name: "ls", args: { path: "a/" } },
        { name: "grep", args: { pattern: "alpha", path: "a/", limit: 2 } },
        read("a/alpha.txt"),
        { name: "read", args: { path: path("a/alpha.txt"), offset: 15, limit: 2 } },
        read("a/alpha.txt")
      ]
    ],
    [
      "normalization",
      [
        { name: "ls", args: { path: "a/" } },
        { name: "grep", args: { pattern: "alpha", path: "./a/nested/../", limit: 2 } },
        read("a/alpha.txt"),
        { name: "read", args: { path: "./a/nested/../beta.txt", offset: 15, limit: 2 } }
      ]
    ],
    [
      "exceptions",
      [read("a/alpha.txt"), read("a/missing.txt"), read("a/image.png"), read("a/beta.txt")]
    ],
    [
      "filenames",
      [
        "space name.txt",
        "unicode-☃.txt",
        "this-is-a-deliberately-long-filename-for-wrapping-and-tree-connectors.txt"
      ].map((name) => ({ name: "read", args: { path: path(`a/${name}`), offset: 15, limit: 2 } }))
    ],
    [
      "thinking",
      [read("a/alpha.txt"), read("a/beta.txt"), read("a/alpha.txt"), read("a/beta.txt")]
    ],
    [
      "buffered",
      [
        shell('console.log("shell one");'),
        shell('console.log("shell two");'),
        read("a/alpha.txt"),
        read("a/beta.txt"),
        shell('console.log("shell three");'),
        shell('console.log("shell four");'),
        read("a/alpha.txt")
      ]
    ],
    [
      "fff",
      [
        ...["a/**", "./a/**"].flatMap((scope) => [
          { name: "ffgrep", args: { pattern: "^1 alpha", path: scope, limit: 2 } },
          { name: "ffgrep", args: { pattern: "^2 alpha", path: scope, limit: 2 } },
          { name: "fffind", args: { pattern: "", path: scope, limit: 2 } }
        ]),
        { name: "ffgrep", args: { pattern: "^1 alpha", path: "a/", limit: 2 } },
        { name: "ls", args: { path: "a/" } },
        read("a/alpha.txt")
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

async function streamCalls(
  { message, events }: FixtureStreamContext,
  calls: readonly PlannedCall[],
  options: { buffered: boolean; signal: AbortSignal | undefined }
): Promise<void> {
  for (const planned of calls) {
    // Queue shared partials without yielding to expose calls in earlier
    // thinking/tool events, as a buffered provider response can do.
    if (!options.buffered) await pause(120, options.signal);
    const contentIndex = message.content.length;
    const call = fauxToolCall(planned.name, {}, { id: randomUUID() });
    message.content.push(call);
    events.push({ type: "toolcall_start", contentIndex, partial: message });
    if (!options.buffered) await pause(120, options.signal);
    call.arguments = planned.args;
    events.push({
      type: "toolcall_delta",
      contentIndex,
      delta: JSON.stringify(call.arguments),
      partial: message
    });
    events.push({ type: "toolcall_end", contentIndex, toolCall: call, partial: message });
  }
}

/** Staged prompts continue from the number of completed calls in the transcript. */
function pendingCalls(
  prompt: string,
  plan: readonly PlannedCall[],
  completed: number,
  appendText: (text: string) => void
): readonly PlannedCall[] {
  if (prompt === "thinking") return plan.slice(completed, completed + 1);

  if (prompt === "summary") {
    let start = 0;
    const turn = SUMMARY_TURNS.find((candidate) => {
      if (start === completed) return true;
      start += candidate.calls;

      return false;
    });
    if (turn?.text) appendText(turn.text);

    return turn ? plan.slice(completed, completed + turn.calls) : [];
  }

  if (prompt === "buffered") {
    let batchSize = 1;
    if (completed === 0) batchSize = 3;
    else if (completed === 4) batchSize = 2;

    return plan.slice(completed, completed + batchSize);
  }

  return completed > 0 ? [] : plan;
}

export function createDisplayFixtureStream(cwd: string): ProviderStreams["stream"] {
  const plans = scenarios(cwd);

  return (model, context, { signal } = {}) =>
    createFixtureStream({
      model,
      signal,
      async run(fixture) {
        const { message: output, events, text: appendText } = fixture;
        let userIndex = context.messages.length - 1;
        while (userIndex >= 0 && context.messages[userIndex]?.role !== "user") userIndex--;
        const user = context.messages[userIndex];
        const prompt = user?.role === "user" ? contentText(user.content).trim() : "";
        const plan = plans.get(prompt);

        if (!plan) {
          appendText(`Choose a fixture prompt: ${[...plans.keys()].join(", ")}.`);

          return "stop";
        }

        // Context, not a closure counter, determines completion across reload/replay.
        const completed = context.messages
          .slice(userIndex + 1)
          .filter((message) => message.role === "toolResult").length;
        const available = new Set(getCurrentTools(context.messages).map((tool) => tool.name));
        const missing = plan.filter((call) => !available.has(call.name));

        if (missing.length > 0) {
          appendText(
            `Skipped fixture ${prompt}: unavailable tools ${[...new Set(missing.map((call) => call.name))].join(", ")}.`
          );

          return "stop";
        }

        const pending = pendingCalls(prompt, plan, completed, appendText);

        if (pending.length > 0) {
          if (prompt === "thinking" || prompt === "buffered") {
            const contentIndex = output.content.length;
            const thought = `Fixture thought before call ${completed + 1}.`;
            output.content.push({ type: "thinking", thinking: thought });
            events.push({ type: "thinking_start", contentIndex, partial: output });
            events.push({ type: "thinking_delta", contentIndex, delta: thought, partial: output });
            await pause(1000, signal);
            events.push({ type: "thinking_end", contentIndex, content: thought, partial: output });
            if (prompt === "thinking" && completed === 2)
              appendText(
                "Visible explanation: this remains a group boundary even when thinking is hidden."
              );
          }

          await streamCalls(fixture, pending, {
            buffered: prompt === "buffered",
            signal
          });

          return "toolUse";
        } else {
          appendText(
            `Fixture finished: ${prompt}. Inspect the tool rows; failures may be intentional.`
          );

          return "stop";
        }
      }
    });
}

export default async function displayFixture(pi: ExtensionAPI): Promise<void> {
  const cwd = process.cwd();
  await assertFixtureWorkspace(cwd);
  const stream = createDisplayFixtureStream(cwd);

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
