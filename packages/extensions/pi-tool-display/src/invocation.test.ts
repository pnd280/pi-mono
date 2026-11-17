import { expect, it } from "vite-plus/test";

import { parametersText } from "./invocation.ts";

// Freezing makes any write during preparation throw. Arrays take a separate traversal path.
it("leaves borrowed arguments unchanged when preparing a complete compact prefix", () => {
  const args = Object.freeze({
    values: Object.freeze([null, false, 0, ""]),
    nested: Object.freeze({ first: 1 })
  });
  const before = structuredClone(args);
  expect(parametersText({ kind: "parameters", value: args }, 1024)).toEqual({
    text: '({"values":[null,false,0,""],"nested":{"first":1}})',
    truncated: false
  });
  expect(args).toStrictEqual(before);
});
