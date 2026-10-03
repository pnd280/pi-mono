import { expect, it } from "vite-plus/test";

import { fffResultParts, fffTextNotices } from "./result-presentation.ts";

const complete = { isError: false, isPartial: false };

it("extracts only ordered warnings from a large source envelope and leaves borrowed content intact", () => {
  const prefix = "[0 exact matches. Maybe you meant this?]";
  const trailer = '[Continue with cursor="next"]';
  const source = "example.ts\n" + " 1: retained match\n".repeat(10_000).trimEnd();
  const text = `${prefix}\n${source}\n\n${trailer}`;
  const supplied = {
    content: [
      { type: "text" as const, text },
      { type: "image" as const, mimeType: "image/png", data: "PRIVATE_IMAGE_BYTES" }
    ],
    details: { totalMatched: 10_000, totalFiles: 1 }
  };
  const before = structuredClone(supplied);
  expect(fffTextNotices(supplied, "grep")).toEqual([
    { kind: "warning", text: prefix },
    { kind: "warning", text: trailer }
  ]);
  const parts = fffResultParts(text, "grep", complete);
  expect(parts.map((part) => part.text).join("")).toBe(text);
  expect(parts.filter((part) => part.kind === "warning")).toEqual([
    { kind: "warning", text: prefix },
    { kind: "warning", text: trailer }
  ]);
  expect(supplied).toEqual(before);
});
