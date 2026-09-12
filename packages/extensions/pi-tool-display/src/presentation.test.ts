import { describe, expect, it } from "vite-plus/test";

import { invocationParts, resultText } from "./presentation.ts";

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
      "token in src (*.ts)"
    );
    expect(text("docs.search", { query: "TUI" }, "invocation")).toBe(
      'docs.search({"query":"TUI"})'
    );
  });

  it("distinguishes supplied values from annotations even when they contain the same delimiters", () => {
    const parts = invocationParts(
      "grep",
      { pattern: " in ", path: "a (b)", glob: "(c)" },
      "search"
    );
    expect(
      parts.filter((part) => part.kind === "value" || part.kind === "path").map((part) => part.text)
    ).toEqual([" in ", "a (b)", "(c)"]);
    expect(
      parts
        .filter((part) => part.kind === "annotation")
        .map((part) => part.text)
        .join("")
    ).toBe(" in  ()");
    const shell = invocationParts("bash", { command: "echo '(timeout 10s)'", timeout: 5 }, "shell");
    expect(shell.filter((part) => part.kind === "value").map((part) => part.text)).toEqual([
      "echo '(timeout 10s)'"
    ]);
    expect(shell.filter((part) => part.kind === "annotation").map((part) => part.text)).toEqual([
      " (timeout 5s)"
    ]);
  });

  it("keeps every text/media block without including image bytes", () => {
    expect(
      resultText({
        content: [
          { type: "text", text: "first" },
          { type: "image", mimeType: "image/png", data: "private-image-data" },
          { type: "text", text: "last\n" }
        ],
        details: undefined
      })
    ).toBe("first\n[Image: image/png]\nlast");
  });
});
