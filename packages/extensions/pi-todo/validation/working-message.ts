import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  contentText,
  createProvider,
  fauxToolCall,
  type ProviderStreams
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFixtureStream } from "@pi-mono/libs/validation/provider";
import { registerWorkingMessage } from "@pi-mono/libs/working-message";

import { pagingPlan, pagingTranscript } from "./paging.ts";

export default function workingMessageFixture(pi: ExtensionAPI): void {
  const status = registerWorkingMessage(pi, {
    id: "fixture.status",
    label: "Other status",
    contributor: "fixture"
  });
  registerWorkingMessage(pi, {
    id: "fixture.inactive",
    label: "Inactive component",
    contributor: "fixture"
  });
  pi.on("session_start", () => status.setText("Other status"));
  pi.registerCommand("fixture-status", {
    description: "Set the other contribution; empty arguments clear it",
    handler: async (args) => {
      status.setText(args);
    }
  });
  const plan = [
    { action: "clear" },
    {
      action: "create",
      subject: "Validate working messages",
      inProgressLabel: "Checking composition"
    },
    { action: "update", id: 1, status: "in_progress" }
  ];
  const stream: ProviderStreams["stream"] = (model, context, { signal } = {}) =>
    createFixtureStream({
      model,
      signal,
      async run({ message, events, text }) {
        let userIndex = context.messages.length - 1;
        while (userIndex >= 0 && context.messages[userIndex]?.role !== "user") userIndex--;
        const user = context.messages[userIndex];
        const prompt = user?.role === "user" ? contentText(user.content).trim() : "";
        const completed = context.messages
          .slice(userIndex + 1)
          .filter((item) => item.role === "toolResult").length;
        let steps: { action: string }[] = [];
        if (prompt === "pages") steps = pagingPlan;
        else if (prompt === "seed") steps = plan;
        const args = steps[completed];

        if (args) {
          const call = fauxToolCall("todo", args, { id: randomUUID() });
          message.content.push(call);
          events.push({ type: "toolcall_start", contentIndex: 0, partial: message });
          events.push({ type: "toolcall_end", contentIndex: 0, toolCall: call, partial: message });

          return "toolUse";
        }

        if (prompt === "hold") await delay(30_000, undefined, { signal });
        text(
          prompt === "pages"
            ? pagingTranscript
            : "Offline fixture: seed creates an active todo; pages creates 40 long todos; hold runs for 30 seconds (Esc cancels)."
        );

        return "stop";
      }
    });
  pi.registerProvider(
    createProvider({
      id: "working-message-fixture",
      auth: {
        apiKey: {
          name: "Offline fixture",
          resolve: async () => ({ auth: { apiKey: "offline" }, source: "fixture" })
        }
      },
      models: [
        {
          id: "offline",
          name: "Offline working-message fixture",
          api: "working-message-fixture",
          provider: "working-message-fixture",
          baseUrl: "http://localhost.invalid",
          reasoning: false,
          input: ["text"],
          contextWindow: 200000,
          maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }
      ],
      api: { stream, streamSimple: stream }
    })
  );
}
