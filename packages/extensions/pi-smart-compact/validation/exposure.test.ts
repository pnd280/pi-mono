import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it } from "vite-plus/test";

import smartCompact from "../src/index.ts";

it("rejects nested compaction requests while leaving context inspection composable", async () => {
  let inspected = false;
  const fixture = await hostFixture([
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
    const direct = session.agent.state.tools.find((tool) => tool.name === "compact");
    expect(await direct?.execute("direct", {})).toMatchObject({ details: { scheduled: true } });
  } finally {
    await fixture.dispose();
  }
});
