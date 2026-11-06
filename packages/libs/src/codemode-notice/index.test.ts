import {
  fauxAssistantMessage,
  fauxProvider,
  getCurrentTools,
  type FauxResponseFactory
} from "@earendil-works/pi-ai";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { expect, it } from "vite-plus/test";

import { hostFixture } from "../validation/interactive-host/index.ts";
import { withCodemodeNotice } from "./index.ts";

it("adds the codemode notice to a model-only tool's declared description exactly while codemode is declared", async () => {
  const fixture = await hostFixture([
    createCodemodeExtension(),
    (pi) => {
      pi.registerTool(
        withCodemodeNotice({
          name: "probe",
          exposure: "model-only",
          label: "Probe",
          description: "Offline fixture",
          parameters: Type.Object({}),
          execute: () => Promise.resolve({ content: [], details: undefined })
        })
      );
    }
  ]);
  const { session } = fixture;

  try {
    await fixture.bind();
    const faux = fauxProvider({ provider: "codemode-notice", models: [{ id: "offline" }] });
    session.modelRuntime.registerNativeProvider(faux.provider);
    await session.modelRuntime.refresh({ allowNetwork: false });
    await session.setModel(faux.getModel());
    const descriptions: (string | undefined)[] = [];

    const record: FauxResponseFactory = (context) => {
      descriptions.push(
        getCurrentTools(context.messages).find((tool) => tool.name === "probe")?.description
      );

      return fauxAssistantMessage("done");
    };

    faux.setResponses([record, record, record]);
    const withoutCodemode = session.getActiveToolNames();
    expect(withoutCodemode).toContain("probe");
    expect(withoutCodemode).not.toContain("codemode");

    await session.prompt("Without codemode");
    session.setActiveToolsByName([...withoutCodemode, "codemode"]);
    await session.prompt("With codemode");
    session.setActiveToolsByName(withoutCodemode);
    await session.prompt("Without codemode again");

    expect(descriptions).toEqual([
      "Offline fixture",
      "Offline fixture\n\nCall this tool directly. It is not available inside codemode.",
      "Offline fixture"
    ]);
  } finally {
    await fixture.dispose();
  }
});
