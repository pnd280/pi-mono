import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { layoutPreview } from "./index.ts";

it("lays out complete text cooperatively without splitting surrogate pairs or losing trailing lines", async () => {
  expect(await layoutPreview("", 40, () => true)).toEqual([""]);
  expect(await layoutPreview("line\n", 40, () => true)).toEqual(["line", ""]);
  const text = "x".repeat(4095) + "😀" + "界".repeat(300000) + "\nTAIL";
  const lines = await layoutPreview(text, 40, () => true);
  expect(lines.at(-1)).toBe("TAIL");
  expect(lines.every((line) => visibleWidth(line) <= 40)).toBe(true);
  expect(lines.join("")).toContain("😀");
  expect(lines.join("")).not.toContain("\uFFFD");
  expect(await layoutPreview(text, 40, () => false)).toEqual([]);
});
