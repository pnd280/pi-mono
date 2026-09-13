import { createInterface } from "node:readline";

import { record } from "../presentation.ts";

const tools = ["echo", "fail", "image", "large"].map((name) => ({
  name,
  description: `Offline display fixture: ${name}`,
  inputSchema: { type: "object", properties: { value: { type: "string" } } }
}));

/** Minimal stdio MCP backend for the fixed terminal plan; no network or filesystem work. */
function respond(method: unknown, params: unknown): unknown {
  if (method === "initialize")
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "tool-display-fixture", version: "1.0.0" }
    };
  if (method === "ping") return {};
  if (method === "tools/list") return { tools };
  if (method !== "tools/call") return undefined;
  const { name, arguments: args } = record(params);
  if (name === "image")
    return {
      content: [
        { type: "text", text: "before image" },
        {
          type: "image",
          mimeType: "image/png",
          data: "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAG0lEQVR4nGP4z8BANiJf56jmUc2jmkc1U0UzADHNjoAymaoJAAAAAElFTkSuQmCC"
        },
        { type: "resource", resource: { uri: "fixture:///reference", text: "after image" } }
      ]
    };

  return {
    ...(name === "fail" ? { isError: true } : {}),
    content: [
      {
        type: "text",
        text:
          name === "large"
            ? "retained fixture output\n".repeat(3000)
            : name === "fail"
              ? "intentional MCP error"
              : (record(args).value ?? "fixture output")
      }
    ]
  };
}

for await (const line of createInterface({ input: process.stdin })) {
  const message = record(JSON.parse(line));
  if (message.id === undefined) continue;
  const result = respond(message.method, message.params);
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      ...(result === undefined
        ? { error: { code: -32601, message: "Method not found" } }
        : { result })
    }) + "\n"
  );
}
