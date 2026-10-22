import { Type } from "@earendil-works/pi-ai";
import {
  createSyntheticSourceInfo,
  type AgentSession,
  type ToolInfo
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vite-plus/test";

import { loadDisplaySettings } from "../settings.ts";
import { DisplayCollectors } from "./collection.ts";

it("keeps Pi's arguments unchanged when it validates a copy of them", async () => {
  const tool: ToolInfo = {
    name: "probe",
    description: "probe",
    parameters: Type.Object({
      path: Type.String(),
      label: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number())
    }),
    exposure: "direct",
    sourceInfo: createSyntheticSourceInfo("probe", { source: "local" })
  };
  // Argument validation reads only the tool registry.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const session = { getAllTools: () => [tool] } as unknown as AgentSession;
  // Validation removes the optional null and converts the string.
  const supplied = { path: "a.ts", label: null, limit: "2" };
  const before = structuredClone(supplied);
  const collection = new DisplayCollectors();

  try {
    const received = collection.tools(session, loadDisplaySettings([])).args("probe", supplied);
    // The validated copy differs, so the normalization that could modify Pi's object ran.
    expect(received).not.toEqual(before);
    expect(supplied).toEqual(before);
  } finally {
    collection.dispose();
  }
});
