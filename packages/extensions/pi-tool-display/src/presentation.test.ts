import { describe, expect, it } from "vite-plus/test";

import { diffStatistics, invocationDetail, resultNotices, resultText } from "./presentation.ts";

describe("tool presentation", () => {
  it("accepts partial arguments and preserves paths, read ranges, and search scope", () => {
    expect(invocationDetail("read", undefined, "read")).toBe("…");
    expect(invocationDetail("read", { path: 42 }, "read")).toBe("…");
    expect(invocationDetail("read", { file_path: "src/a.ts", offset: 10, limit: 2 }, "read")).toBe(
      "src/a.ts:10-11"
    );
    expect(
      invocationDetail("grep", { pattern: "token", path: "src", glob: "*.ts" }, "search")
    ).toBe("token in src (*.ts)");
    expect(invocationDetail("docs.search", { query: "TUI" }, "invocation")).toBe(
      'docs.search({"query":"TUI"})'
    );
  });

  it("keeps every text/media block and reports backend omissions without including image bytes", () => {
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
    const notices = resultNotices({
      truncation: { truncated: true },
      fullOutputPath: "/tmp/output",
      matchLimitReached: 20,
      linesTruncated: true
    });
    expect(notices.join("\n")).toContain("/tmp/output");
    expect(notices.join("\n")).toContain("Match limit");
    expect(notices.filter((notice) => notice.includes("truncated"))).toHaveLength(2);
    expect(resultNotices(undefined)).toEqual([]);
  });

  it("counts Pi diff lines without mistaking source text or context for changes", () => {
    expect(diffStatistics(" 10 +context\n-11 old\n+11 new\n+12 more\n ...")).toBe("+2 -1");
  });
});
