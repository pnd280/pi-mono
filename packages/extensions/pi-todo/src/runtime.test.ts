import { expect, it } from "vite-plus/test";

import { shouldActivate } from "./runtime.ts";

it("registers only in interactive CLI invocations, respecting the argument terminator", () => {
  const runtime = { argv: ["node", "pi"], stdinIsTTY: true, stdoutIsTTY: true, title: "pi" };
  expect(shouldActivate(runtime)).toBe(true);

  for (const args of [
    ["-p"],
    ["--print"],
    ["--mode", "rpc"],
    ["--mode=json"],
    ["--export"],
    ["--help"],
    ["--version"],
    ["--list-models"]
  ]) {
    expect(shouldActivate({ ...runtime, argv: [...runtime.argv, ...args] })).toBe(false);
  }

  expect(shouldActivate({ ...runtime, argv: [...runtime.argv, "--", "-p"] })).toBe(true);
  expect(shouldActivate({ ...runtime, title: "worker-rpc" })).toBe(false);
  expect(shouldActivate({ ...runtime, stdinIsTTY: undefined })).toBe(false);
  expect(shouldActivate({ ...runtime, stdoutIsTTY: false })).toBe(false);
});
