import { openBrowser as openSharedBrowser } from "@pi-mono/libs/tui/open-browser";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ViewRequest } from "../manager.ts";
import { readCollection } from "../storage/collection.ts";
import { collection, entry } from "../test-fixture.ts";
import { openBrowser } from "./open.ts";

vi.mock("@pi-mono/libs/tui/open-browser", () => ({ openBrowser: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("formats compact ages at every unit threshold through browser rows", async () => {
  const now = Date.UTC(2026, 0, 1);
  const day = 86400;
  const cases = [
    [5 * 3600, "5h"],
    [0, "now"],
    [59.999, "now"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [day - 1, "23h"],
    [day, "1d"],
    [7 * day - 1, "6d"],
    [7 * day, "1w"],
    [30 * day - 1, "4w"],
    [30 * day, "1mo"],
    [365 * day - 1, "12mo"],
    [365 * day, "1y"]
  ] as const;
  const snapshot = collection(
    cases.map(([seconds], index) =>
      entry(`prompt ${index}`, { recordedAt: new Date(now - seconds * 1000).toISOString() })
    )
  );
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(openSharedBrowser).mockImplementation(async (options) => {
    const section = options.browser.sections.find((candidate) => candidate.id === "drafts")!;
    const loaded = await section.load(new AbortController().signal);
    const rows = options.browser.format(loaded.items, {
      fg: (_color, text) => text,
      bold: (text) => text
    });
    expect(rows.items.map((item) => item.label)).toEqual(
      cases.map(([, age], index) => `${age.padEnd(4)}  prompt ${index}`)
    );
    expect(clock).toHaveBeenCalledTimes(1);
  });
  await openBrowser(
    { custom: vi.fn() },
    { read: async () => snapshot, copy: vi.fn(), remove: vi.fn(), notify: vi.fn() },
    {
      collection: "drafts",
      initialEditor: "",
      inspectionIndex: undefined,
      signal: new AbortController().signal,
      afterClose: async () => {}
    }
  );
});

it("aligns future and unknown ages without suggesting a past age", async () => {
  const now = Date.UTC(2026, 0, 1);
  const snapshot = collection([
    entry("future hours", { recordedAt: new Date(now + 5 * 3600 * 1000).toISOString() }),
    entry("future minute", { recordedAt: new Date(now + 60000).toISOString() }),
    entry("future seconds", { recordedAt: new Date(now + 59999).toISOString() }),
    entry("unknown", { recordedAt: "invalid" })
  ]);
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(openSharedBrowser).mockImplementation(async (options) => {
    const section = options.browser.sections.find((candidate) => candidate.id === "drafts")!;
    const loaded = await section.load(new AbortController().signal);
    const fg = vi.fn((_color: string, text: string) => text);
    const rows = options.browser.format(loaded.items, { fg, bold: (text) => text });
    expect(rows.items.map((item) => item.label)).toEqual([
      "+5h           future hours",
      "+1m           future minute",
      "now           future seconds",
      "Unknown time  unknown"
    ]);
    expect(options.browser.preview(loaded.items[3]).metadata).toBe("Unknown time");
    const text = rows.items[0]!.label;
    const primary = { text, maxWidth: 80, columnWidth: 80, item: rows.items[0]! };
    expect(rows.layout?.truncatePrimary?.({ ...primary, isSelected: false })).toBe(text);
    expect(fg).toHaveBeenCalledExactlyOnceWith("muted", "+5h         ");
    fg.mockClear();
    expect(rows.layout?.truncatePrimary?.({ ...primary, isSelected: true })).toBe(text);
    expect(fg).not.toHaveBeenCalled();
  });
  await openBrowser(
    { custom: vi.fn() },
    { read: async () => snapshot, copy: vi.fn(), remove: vi.fn(), notify: vi.fn() },
    {
      collection: "drafts",
      initialEditor: "",
      inspectionIndex: undefined,
      signal: new AbortController().signal,
      afterClose: async () => {}
    }
  );
});

it("does not diagnose invalid IDs when non-finite numbers make a collection read-only", async () => {
  const snapshot = readCollection(
    "drafts",
    "/fixture",
    Buffer.from(
      '{"version":1,"cwd":"/fixture","entries":[{"id":"11111111-1111-1111-1111-111111111111","text":"keep","recordedAt":1e400}]}'
    )
  );
  const ports = {
    read: async () => snapshot,
    copy: vi.fn(async () => {}),
    remove: vi.fn(async () => ({ status: "failed" as const, message: "Unexpected removal" })),
    notify: vi.fn()
  };
  vi.mocked(openSharedBrowser).mockImplementation(async (options) => {
    const section = options.browser.sections.find((candidate) => candidate.id === "drafts")!;
    const loaded = await section.load(new AbortController().signal);
    expect(loaded.message).toMatch(/read.only/i);
    expect(loaded.message).not.toMatch(/\bids?\b/i);
    expect(section.remove?.enabled(loaded.items[0])).toBe(false);
    expect(await section.confirm?.run(loaded.items[0])).toBe(true);
  });
  await openBrowser({ custom: vi.fn() }, ports, {
    collection: "drafts",
    initialEditor: "",
    inspectionIndex: undefined,
    signal: new AbortController().signal,
    afterClose: async () => {}
  });
  expect(ports.remove).not.toHaveBeenCalled();
});

it.each(["restore", "restore-delete", "cancel", "unsafe"] as const)(
  "delivers %s intent only through final closure without performing restoration",
  async (action) => {
    const snapshot = collection([entry(action === "unsafe" ? "unsafe\x1b[2J" : " \tsource\r\n ")]);
    const afterClose = vi.fn<ViewRequest["afterClose"]>(async () => {});
    const ports = {
      read: async () => snapshot,
      copy: vi.fn(async () => {}),
      remove: vi.fn(async () => ({ status: "failed" as const, message: "Unexpected removal" })),
      notify: vi.fn()
    };
    vi.mocked(openSharedBrowser).mockImplementation(async (options) => {
      const section = options.browser.sections.find((candidate) => candidate.id === "drafts")!;
      const loaded = await section.load(new AbortController().signal);

      if (action !== "cancel") {
        const select = action === "restore-delete" ? section.alternate! : section.confirm!;
        expect(await select.run(loaded.items[0])).toBe(action !== "unsafe");
      }

      expect(afterClose).not.toHaveBeenCalled();
      expect(ports.remove).not.toHaveBeenCalled();
      await options.afterClose?.();
    });
    await openBrowser({ custom: vi.fn() }, ports, {
      collection: "drafts",
      initialEditor: "editor",
      inspectionIndex: undefined,
      signal: new AbortController().signal,
      afterClose
    });
    expect(afterClose).toHaveBeenCalledExactlyOnceWith(
      action === "unsafe" || action === "cancel"
        ? undefined
        : { target: snapshot.entries[0], deleteAfterRestore: action === "restore-delete" }
    );
    expect(ports.remove).not.toHaveBeenCalled();
    if (action === "unsafe") {
      expect(ports.notify).toHaveBeenCalledWith(expect.any(String), "error");
    } else expect(ports.notify).not.toHaveBeenCalled();
  }
);
