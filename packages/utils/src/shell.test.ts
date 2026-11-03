import { execFileSync } from "node:child_process";

import { expect, it } from "vite-plus/test";

import { quotePosixShellArgument } from "./shell.ts";

it("preserves empty arguments, Unicode, whitespace, quotes, and shell syntax literally", () => {
  const values = [
    "",
    "plain",
    "space\tand\nnewline",
    "界😀",
    "a'b'c",
    '"\\$HOME $(printf injected) `printf injected`; * [a] ~ #'
  ];
  const output = execFileSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      `printf '%s\\0' ${values.map(quotePosixShellArgument).join(" ")}`
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH } }
  );
  expect(output).toBe(values.map((value) => `${value}\0`).join(""));
});
