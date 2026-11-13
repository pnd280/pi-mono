import { expect, it } from "vite-plus/test";

import { registeredBy } from "./provenance.ts";

const tool = (source: string, path: string) => ({ sourceInfo: { source, path } });

it("recognises npm and entry-point provenance while rejecting lookalikes and SDK labels", () => {
  expect(registeredBy(tool("npm:@scope/pkg@1.2.3", "/index.ts"), "@scope/pkg")).toBe(true);
  expect(registeredBy(tool("cli", "C:\\store\\@scope\\pkg\\src\\index.ts"), "@scope/pkg")).toBe(
    true
  );
  for (const source of ["builtin", "sdk", "npm:@fake/pkg", "npm:@scope/pkg-lookalike"])
    expect(registeredBy(tool(source, "/fixture/index.ts"), "@scope/pkg")).toBe(false);
  expect(registeredBy(tool("sdk", "/@scope/pkg/src/index.ts"), "@scope/pkg")).toBe(false);
});
