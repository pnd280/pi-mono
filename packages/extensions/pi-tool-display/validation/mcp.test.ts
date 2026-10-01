import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent
} from "@earendil-works/pi-coding-agent";
import { createValidationWorkspace } from "@pi-mono/libs/validation/pi-process";
import { expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { selectAdapter } from "../src/host/selection.ts";
import { loadDisplaySettings } from "../src/settings.ts";

it("recognizes discovered MCP tools with normalized and colliding names without losing server identity", async () => {
  const directory = await createValidationWorkspace("display-mcp-");
  const cwd = join(directory, "work");
  const agentDir = join(directory, "agent");
  let session: AgentSession | undefined;
  vi.stubEnv("PI_OFFLINE", "1");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);

  try {
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      additionalExtensionPaths: ["builtin:codemode", "builtin:mcp"],
      extensionFactories: [
        { name: "codemode", builtin: true, factory: createCodemodeExtension({ mode: "on" }) },
        {
          name: "mcp",
          builtin: true,
          factory: createMcpExtension({
            loadConfig: () => ({
              errors: [],
              servers: [
                {
                  name: "display-fixture",
                  source: "fixture",
                  config: {
                    command: process.execPath,
                    args: [fileURLToPath(new URL("./mcp-server.ts", import.meta.url))]
                  }
                }
              ]
            })
          })
        }
      ]
    });
    await resourceLoader.reload();
    expect(resourceLoader.getExtensions().errors).toEqual([]);
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-store.json"),
      refreshOnCreate: false,
      allowModelNetwork: false
    });
    const faux = fauxProvider({ provider: "display-mcp", models: [{ id: "offline" }] });
    modelRuntime.registerNativeProvider(faux.provider);
    await modelRuntime.refresh({ allowNetwork: false });
    ({ session } = await createAgentSession({
      cwd,
      agentDir,
      settingsManager,
      resourceLoader,
      modelRuntime,
      model: faux.getModel(),
      sessionManager: SessionManager.inMemory(cwd)
    }));
    const children: Extract<AgentSessionEvent, { type: "tool_execution_end" }>[] = [];
    session.subscribe((event) => {
      if (event.type === "tool_execution_end" && event.parentToolCallId === "mcp-parent")
        children.push(event);
    });
    await session.bindExtensions({});
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall(
          "codemode",
          {
            code: 'const matches = await searchTools("echo", { namespace: "mcp__display_fixture", limit: 10 }); for (const {name} of matches.filter(tool => tool.name.startsWith("mcp__display_fixture__echo_value_"))) text(await tools[name]({value:"offline"}));'
          },
          { id: "mcp-parent" }
        )
      ]),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Discover and call both echo tools");
    expect(children).toHaveLength(2);
    const identities: string[] = [];
    const names: string[] = [];

    for (const event of children) {
      expect(event.isError).toBe(false);
      expect(event.toolName).toMatch(/^mcp__display_fixture__echo_value_[a-f0-9]+$/);
      names.push(event.toolName);
      const info = session.getAllTools().find((tool) => tool.name === event.toolName);
      expect(info?.exposure).toBe("deferred");
      expect(info?.namespace?.name).toBe("mcp__display_fixture");
      const adapter = selectAdapter(
        loadDisplaySettings([]),
        event.toolName,
        session.getToolDefinition(event.toolName),
        false,
        info
      );
      expect(adapter?.id).toBe("builtin:mcp");
      const result = z
        .object({
          content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
          details: z.object({ server: z.string(), tool: z.string() })
        })
        .parse(event.result);
      const before = structuredClone(result);
      expect(adapter?.mcp?.({ value: "offline" }, result)).toEqual({
        server: "display-fixture",
        tool: result.details.tool,
        outcome: "success",
        content: [{ type: "text", text: "offline" }]
      });
      expect(result).toEqual(before);
      identities.push(result.details.tool);
    }

    expect(new Set(names).size).toBe(2);
    expect(identities.sort()).toEqual(["echo-value", "echo_value"]);
  } finally {
    await session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session?.dispose();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
