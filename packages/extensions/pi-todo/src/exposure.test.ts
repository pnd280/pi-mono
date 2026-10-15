import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it } from "vite-plus/test";

import { TodoController } from "./state/controller.ts";
import { createTodoTool } from "./tool.ts";

it("keeps todo model-issued and replayable while rejecting nested mutations", async () => {
  const controller = new TodoController();
  let inspected = false;
  const fixture = await hostFixture([
    (pi) => {
      pi.registerTool(createTodoTool(controller));
      pi.registerTool({
        name: "probe",
        label: "Probe",
        description: "Offline fixture",
        parameters: Type.Object({}),
        async execute(_id, _args, _signal, _update, context) {
          expect(context.tools.some((tool) => tool.name === "todo")).toBe(false);
          expect(
            (await context.executeTool("todo", { action: "create", subject: "Lost child" })).isError
          ).toBe(true);
          expect(controller.getTodos()).toEqual([]);
          inspected = true;

          return { content: [{ type: "text", text: "inspected" }], details: undefined };
        }
      });
    }
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    expect(session.getActiveToolNames()).toContain("todo");
    expect(session.getAllTools().find((tool) => tool.name === "todo")?.exposure).toBe("model-only");
    const faux = fauxProvider({ provider: "todo-fixture", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("probe", {})]),
      fauxAssistantMessage([fauxToolCall("todo", { action: "create", subject: "Retained" })]),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Create a todo");
    expect(inspected).toBe(true);
    const restored = new TodoController();
    restored.reconstructFromBranch(session.sessionManager.getBranch());
    expect(restored.getState()).toEqual(controller.getState());
    expect(restored.getTodos()).toMatchObject([{ subject: "Retained" }]);
  } finally {
    await fixture.dispose();
  }
});
