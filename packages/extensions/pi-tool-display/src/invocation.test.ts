import { describe, expect, it } from "vite-plus/test";

import { invocationParts } from "./invocation.ts";

describe("tool presentation", () => {
  it("accepts partial arguments and preserves paths, read ranges, and search scope", () => {
    const text = (...args: Parameters<typeof invocationParts>) =>
      invocationParts(...args)
        .map((part) => part.text)
        .join("");
    expect(text("read", undefined, "read")).toBe("…");
    expect(text("read", { path: 42 }, "read")).toBe("…");
    expect(text("read", { file_path: "src/a.ts", offset: 10, limit: 2 }, "read")).toBe(
      "src/a.ts:10-11"
    );
    expect(text("grep", { pattern: "token", path: "src", glob: "*.ts" }, "search")).toBe(
      "token \u2014 src (*.ts)"
    );
    expect(text("docs.search", { query: "TUI" }, "invocation")).toBe(
      'docs.search({"query":"TUI"})'
    );
  });

  it("distinguishes supplied values from annotations even when they contain the same delimiters", () => {
    const parts = invocationParts(
      "grep",
      { pattern: " \u2014 ", path: "a (b)", glob: "(c)" },
      "search"
    );
    expect(
      parts.filter((part) => part.kind === "value" || part.kind === "path").map((part) => part.text)
    ).toEqual([" \u2014 ", "a (b)", "(c)"]);
    expect(
      parts
        .filter((part) => part.kind === "annotation")
        .map((part) => part.text)
        .join("")
    ).toBe(" \u2014  ()");
    const shell = invocationParts("bash", { command: "echo '(timeout 10s)'", timeout: 5 }, "shell");
    expect(shell.filter((part) => part.kind === "value").map((part) => part.text)).toEqual([
      "echo '(timeout 10s)'"
    ]);
    expect(shell.filter((part) => part.kind === "annotation").map((part) => part.text)).toEqual([
      " (timeout 5s)"
    ]);
  });
});
