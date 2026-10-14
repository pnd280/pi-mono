import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { expect, it } from "vite-plus/test";

import nullArgs from "./index.ts";

it("drops optional arguments sent as the text null and passes the rest unchanged", async () => {
  const received: unknown[] = [];
  const fixture = await hostFixture([
    nullArgs,
    (pi) =>
      pi.registerTool({
        name: "probe",
        label: "Probe",
        description: "Offline fixture",
        parameters: Type.Object({
          text: Type.String(),
          mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("slow")])),
          note: Type.Optional(Type.String())
        }),
        async execute(_id, args) {
          received.push(args);

          return { content: [{ type: "text", text: "ok" }], details: undefined };
        }
      })
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "null-args", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("probe", { text: "null", mode: "null", note: "kept" })]),
      fauxAssistantMessage("done")
    ]);
    await session.prompt("Call the probe");
    expect(received).toEqual([{ text: "null", note: "kept" }]);
  } finally {
    await fixture.dispose();
  }
});
