import { SessionManager, type Theme } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { renderSummary } from "./render.ts";
import { summaryEntryType } from "./summary.ts";

const theme: Pick<Theme, "fg"> = { fg: (_color, text) => text };

function savedEntry(data: unknown) {
  const session = SessionManager.inMemory();
  const id = session.appendCustomEntry(summaryEntryType, data);
  const entry = session.getEntry(id);
  if (entry?.type !== "custom") throw new Error("Missing custom entry");

  return entry;
}

it("replays persisted statistics with diff colors and expands the per-file breakdown", () => {
  const entry = savedEntry({
    durationMs: 12000,
    bashCalls: 4,
    files: [
      { path: "src/a.ts", status: "available", added: 40, removed: 10 },
      { path: "src/b.ts", status: "available", added: 2, removed: 1 }
    ]
  });
  const fg = vi.fn(theme.fg);
  const collapsed = renderSummary(entry, { expanded: false }, { fg });
  expect(collapsed?.render(120).join("\n").trim()).toBe(
    "Worked for 12s · 4 bash calls · 2 files · +42 −11"
  );
  expect(fg).toHaveBeenCalledWith("toolDiffAdded", "+42");
  expect(fg).toHaveBeenCalledWith("toolDiffRemoved", "−11");
  expect(fg).toHaveBeenCalledWith("dim", "2 files");
  fg.mockClear();
  collapsed?.invalidate();
  collapsed?.render(120);
  expect(fg).toHaveBeenCalledWith("toolDiffAdded", "+42");
  const expanded = renderSummary(entry, { expanded: true }, theme)?.render(120).join("\n");
  expect(expanded).toContain("src/a.ts · +40 −10");
  expect(expanded).toContain("src/b.ts · +2 −1");
});

it("distinguishes empty, partial, unavailable, and malformed summaries", () => {
  const base = { durationMs: 0, bashCalls: 0, files: [] };
  const text = (data: unknown) =>
    renderSummary(savedEntry(data), { expanded: false }, theme)?.render(120).join("\n").trim();
  expect(text(base)).toBe("Worked for 0s");
  const unavailable = { path: "large.txt", status: "unavailable", reason: "Too large." };
  expect(text({ ...base, files: [unavailable] })).toBe("Worked for 0s · File changes unavailable");
  expect(
    text({
      ...base,
      files: [{ path: "file.txt", status: "available", added: 1, removed: 0 }, unavailable]
    })
  ).toBe("Worked for 0s · 1 file · +1 · File changes partial");
  expect(text({ durationMs: 1000 })).toBeUndefined();
});
