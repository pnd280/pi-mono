import { expect, it } from "vite-plus/test";

import { fffAdapter } from "./fff-tools.ts";
it.each(["npm:@ff-labs/pi-fff@0.10.6"])(
  "recognizes official package source %s and only declared names",
  (source) => {
    const sourceInfo = { source, path: "/index.ts" };
    expect(fffAdapter({ name: "fffind", sourceInfo })).toBe("find");
    expect(fffAdapter({ name: "grep", sourceInfo })).toBe("grep");
    expect(fffAdapter({ name: "fff-multi-grep", sourceInfo })).toBe("multi");
    expect(fffAdapter({ name: "fff-future", sourceInfo })).toBeUndefined();
  }
);
it("recognizes installed local provenance while rejecting lookalikes and SDK labels", () => {
  expect(
    fffAdapter({
      name: "ffgrep",
      sourceInfo: { source: "cli", path: "C:\\store\\@ff-labs\\pi-fff\\src\\index.ts" }
    })
  ).toBe("grep");
  for (const source of ["builtin", "sdk", "npm:@fake/pi-fff", "npm:@ff-labs/pi-fff-lookalike"])
    expect(
      fffAdapter({ name: "ffgrep", sourceInfo: { source, path: "/fixture/index.ts" } })
    ).toBeUndefined();
  expect(
    fffAdapter({
      name: "ffgrep",
      sourceInfo: { source: "sdk", path: "/@ff-labs/pi-fff/src/index.ts" }
    })
  ).toBeUndefined();
  expect(fffAdapter(undefined)).toBeUndefined();
});
