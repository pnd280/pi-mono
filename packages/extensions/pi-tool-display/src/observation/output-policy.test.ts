import { expect, it } from "vite-plus/test";

import { liveOutputOptions } from "./output-policy.ts";

it("configures documented live-output limits and labels generated omissions", () => {
  expect(liveOutputOptions).toMatchObject({
    maxBytes: 1024 * 1024,
    edgeLines: 50,
    lineBytes: 10_280
  });

  const bytes = liveOutputOptions.formatOmission({ count: 3, unit: "bytes" });
  const lines = liveOutputOptions.formatOmission({ count: 2, unit: "lines" });
  expect(bytes.omissions?.map(({ start, end }) => bytes.text.slice(start, end))).toEqual([
    expect.stringContaining("3 bytes omitted")
  ]);
  expect(lines.omissions?.map(({ start, end }) => lines.text.slice(start, end))).toEqual([
    expect.stringContaining("2 lines omitted")
  ]);
});
