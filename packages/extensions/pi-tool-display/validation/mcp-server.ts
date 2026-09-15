import { createInterface } from "node:readline";

import { z } from "zod";

const toolNameSchema = z.enum(["echo", "fail", "image", "large"]);
const inputSchema = z.object({ value: z.string().optional() });
const callSchema = z.object({ name: toolNameSchema, arguments: inputSchema.prefault({}) });
const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional()
});
const tools = toolNameSchema.options.map((name) => ({
  name,
  description: `Offline display fixture: ${name}`,
  inputSchema: z.toJSONSchema(inputSchema)
}));

/** Minimal stdio MCP backend for the fixed terminal plan; no network or filesystem work. */
function respond(method: string, params: unknown): unknown {
  if (method === "initialize")
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "tool-display-fixture", version: "1.0.0" }
    };
  if (method === "ping") return {};
  if (method === "tools/list") return { tools };
  if (method !== "tools/call") return undefined;
  const { name, arguments: args } = callSchema.parse(params);
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

  let text: string;
  if (name === "large") text = "retained fixture output\n".repeat(3000);
  else if (name === "fail") text = "intentional MCP error";
  else text = args.value ?? "fixture output";

  return {
    ...(name === "fail" ? { isError: true } : {}),
    content: [{ type: "text", text }]
  };
}

for await (const line of createInterface({ input: process.stdin })) {
  const raw: unknown = JSON.parse(line);
  const message = requestSchema.parse(raw);
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
