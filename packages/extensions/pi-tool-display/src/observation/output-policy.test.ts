import { expect, it } from "vite-plus/test";

import { liveOutputOptions } from "./output-policy.ts";

it("labels generated live-output omissions", () => {
  const bytes = liveOutputOptions.formatOmission({ count: 3, unit: "bytes" });
  const lines = liveOutputOptions.formatOmission({ count: 2, unit: "lines" });
  expect(bytes.omissions?.map(({ start, end }) => bytes.text.slice(start, end))).toEqual([
    expect.stringContaining("3 bytes omitted")
  ]);
  expect(lines.omissions?.map(({ start, end }) => lines.text.slice(start, end))).toEqual([
    expect.stringContaining("2 lines omitted")
  ]);
});
