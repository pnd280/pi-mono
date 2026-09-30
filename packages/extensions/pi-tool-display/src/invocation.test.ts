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

  it("falls back when supplied parameters cannot be serialized", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(
      invocationParts("custom", circular, "invocation")
        .map((part) => part.text)
        .join("")
    ).toBe("custom(<parameters unavailable>)");
  });

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
    expect(args.text).toBe('quoted "value"\n\t\\界😀');
  });

  it("bounds wide and deep compact traversal and labels incomplete prefixes", () => {
    let reads = 0;
    const items = Array.from({ length: 1000 }, () => ({
      get value() {
        reads++;

        return "item";
      }
    }));
    const part = invocationParts("custom", { items }, "invocation", 128)[2]!;
    expect(part.text).toContain('{"items":[{"value":"item"}');
    expect(part.text.length).toBeLessThanOrEqual(128);
    expect(part.truncated).toBe(true);
    expect(reads).toBeLessThan(20);
    let nested: unknown = "retained";
    for (let index = 0; index < 100; index++) nested = { nested };
    const deep = invocationParts("custom", { nested }, "invocation", 16 * 1024)[2]!;
    expect(deep.truncated).toBe(true);
    expect(deep.text).not.toContain("unavailable");
    expect(invocationParts("custom", { nested }, "invocation")[2]?.text).toContain("retained");
  });

  it("bounds visits to omitted properties and retains invalid-parameter diagnostics", () => {
    let reads = 0;
    const args = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [index, undefined]));
    for (const key of Object.keys(args))
      Object.defineProperty(args, key, {
        get() {
          reads++;

          return undefined;
        }
      });
    const part = invocationParts("custom", args, "invocation", 128)[2]!;
    expect(part.truncated).toBe(true);
    expect(reads).toBeLessThanOrEqual(128);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(invocationParts("custom", circular, "invocation", 128)[2]?.text).toBe(
      "<parameters unavailable>"
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
