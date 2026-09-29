import assert from "node:assert/strict";

import type { Theme } from "@earendil-works/pi-coding-agent";
import { it } from "vite-plus/test";

import { renderSummaryModel, summaryModelEntryType } from "./entry.ts";

const theme: Pick<Theme, "fg"> = { fg: (_color, text) => text };
const entry = {
  type: "custom" as const,
  id: "entry",
  parentId: null,
  timestamp: new Date(0).toISOString(),
  customType: summaryModelEntryType
};

it.each([
  undefined,
  null,
  {},
  { model: 42, thinkingLevel: "low", trigger: "tool" },
  { model: "provider/id", thinkingLevel: "unknown", trigger: "tool" },
  { model: "provider/id", thinkingLevel: "low", trigger: "unknown" }
])("ignores malformed persisted metadata: %j", (data) => {
  assert.equal(renderSummaryModel({ ...entry, data }, { expanded: false }, theme), undefined);
});

it("renders model identifiers as plain single-line labels", () => {
  const component = renderSummaryModel(
    {
      ...entry,
      data: {
        model: "provider/\u001b[31mnested\u001b[0m/\n界",
        thinkingLevel: "low",
        trigger: "tool"
      }
    },
    { expanded: false },
    theme
  );
  assert.equal(
    component?.render(120).join("\n").trim(),
    "Compacted with provider/nested/ 界:low (tool)"
  );
});
