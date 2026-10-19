import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getCurrentTools,
  Type
} from "@earendil-works/pi-ai";
import { expect, it } from "vite-plus/test";

import smartCompact from "../src/index.ts";
import { sdkSessionFixture } from "./sdk-session.ts";

it("rejects nested compaction requests while leaving context inspection composable", async () => {
  let inspected = false;
  const fixture = await sdkSessionFixture([
    smartCompact,
    (pi) =>
      pi.registerTool({
        name: "probe",
        label: "Probe",
        description: "Offline fixture",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, context) {
          expect(context.tools.some((tool) => tool.name === "compact")).toBe(false);
          expect(context.tools.some((tool) => tool.name === "context_window")).toBe(true);
          expect((await context.executeTool("compact", {})).isError).toBe(true);
          expect(await context.executeTool("context_window", {})).toMatchObject({ isError: false });
          inspected = true;

          return { content: [{ type: "text", text: "inspected" }], details: undefined };
        }
      })
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    expect(session.getActiveToolNames()).toContain("compact");
    expect(session.getAllTools().find((tool) => tool.name === "compact")?.exposure).toBe(
      "model-only"
    );
    const faux = fauxProvider({ provider: "compact-exposure", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("probe", {})]),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Inspect tool exposure");
    expect(inspected).toBe(true);
    expect(session.sessionManager.getBranch().some((entry) => entry.type === "compaction")).toBe(
      false
    );
  } finally {
    await fixture.dispose();
  }
});

it("keeps context_window inactive after an earlier extension turns it off at session start", async () => {
  const faux = fauxProvider({ provider: "compact-reregister", models: [{ id: "offline" }] });
  const declared: string[][] = [];
  faux.setResponses([
    (context) => {
      declared.push(getCurrentTools(context.messages).map((tool) => tool.name));

      return fauxAssistantMessage("done");
    }
  ]);
  const fixture = await sdkSessionFixture([
    (pi) =>
      pi.on("session_start", () =>
        pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "context_window"))
      ),
    smartCompact
  ]);
  const { session } = fixture;

  try {
    await writeFile(join(fixture.agentDir, "context-window.md"), "CONFIGURED_DOCS");
    await writeFile(
      join(fixture.agentDir, "settings.json"),
      JSON.stringify({ "ext.pi-smart-compact": { docs: ["context-window.md"] } })
    );
    await fixture.bind();
    expect(
      session.getAllTools().find((tool) => tool.name === "context_window")?.description
    ).toContain("CONFIGURED_DOCS");
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    await session.prompt("List the tools");
    expect(declared).toHaveLength(1);
    expect(declared[0]).toContain("compact");
    expect(declared[0]).not.toContain("context_window");
  } finally {
    await fixture.dispose();
  }
});
