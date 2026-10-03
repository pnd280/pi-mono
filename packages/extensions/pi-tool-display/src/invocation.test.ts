import { expect, it } from "vite-plus/test";

import { invocationParts } from "./invocation.ts";

it("retains JSON spelling and borrows arguments when preparing a complete compact prefix", () => {
  const args = Object.freeze({
    text: 'quoted "value"\n\t\\界😀',
    values: Object.freeze([null, false, 0, NaN, Infinity, undefined]),
    omitted: undefined,
    date: new Date("2025-01-02T00:00:00.000Z"),
    nested: Object.freeze({ first: 1, second: 2 })
  });
  const part = invocationParts("custom", args, "invocation", 1024)[2]!;
  expect(part.text).toBe(
    '{"text":"quoted \\"value\\"\\n\\t\\\\界😀","values":[null,false,0,null,null,null],"date":"2025-01-02T00:00:00.000Z","nested":{"first":1,"second":2}}'
  );
  expect(part.truncated).toBe(false);
});
