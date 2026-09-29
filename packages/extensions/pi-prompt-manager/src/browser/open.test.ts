import { openBrowser as openSharedBrowser } from "@pi-mono/libs/tui/open-browser";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ViewRequest } from "../manager.ts";
import { readCollection } from "../storage/collection.ts";
import { collection, entry } from "../test-fixture.ts";
import { openBrowser } from "./open.ts";

vi.mock("@pi-mono/libs/tui/open-browser", () => ({ openBrowser: vi.fn() }));
afterEach(() => vi.clearAllMocks());

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
    expect(loaded.message).toBe("Read-only: copy/restore; repair collection.");
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
      expect(ports.notify).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("Restoration refused:"),
        "error"
      );
    } else expect(ports.notify).not.toHaveBeenCalled();
  }
);
