import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ReadResult, Repository, MutationResult } from "../model.ts";
import { collection, deferred, entry } from "../test-fixture.ts";
import { BrowserController, type BrowserPorts } from "./controller.ts";
import { actionFor, fixedHints, usableCancelKeys } from "./controls.ts";

const opened: BrowserController[] = [];
afterEach(() => {
  for (const controller of opened.splice(0)) controller.close();
  vi.useRealTimers();
});

function browser(overrides: Partial<BrowserPorts> = {}, inspectionIndex?: number) {
  const snapshot = collection([entry("alpha"), entry("beta"), entry("alpha")]);
  const ports: BrowserPorts = {
    read: async () => snapshot,
    copy: vi.fn(async () => {}),
    restore: vi.fn(() => true),
    restoreAndRemove: vi.fn(async () => true),
    remove: vi.fn<BrowserPorts["remove"]>(async () => ({ status: "failed", message: "busy" })),
    changed: vi.fn(),
    close: vi.fn(),
    now: Date.now,
    ...overrides
  };
  const controller = new BrowserController(ports, {
    collection: "drafts",
    initialEditor: "seed",
    ...(inspectionIndex === undefined ? {} : { inspectionIndex })
  });
  opened.push(controller);

  return { controller, ports, snapshot };
}

it("keeps occurrence selection while filtering and restores each view's query on fresh activation", async () => {
  const read = vi.fn<Repository["read"]>(async (kind) =>
    collection([entry("alpha"), entry("beta")], kind)
  );
  const { controller } = browser({ read });
  await controller.activate();
  expect(controller.query).toBe("");
  controller.action("down");
  const key = controller.selected?.occurrence.key;
  controller.setQuery("beta");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.selected?.occurrence.key).toBe(key);
  controller.setQuery("alpha");
  await vi.waitFor(() => expect(controller.selected?.occurrence.source.text).toBe("alpha"));
  await controller.activate("history");
  expect(controller.query).toBe("seed");
  controller.setQuery("");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  await controller.activate("drafts");
  expect(controller.query).toBe("alpha");
  expect(read).toHaveBeenCalledTimes(3);
});

it("distinguishes loading, empty, no matches and unavailable, ignoring late cancelled reads", async () => {
  const read = deferred<ReadResult>();
  const { controller } = browser({ read: () => read.promise });
  const loading = controller.activate();
  expect(controller.status).toBe("loading");
  controller.action("cancel");
  read.resolve(collection([entry("late")]));
  await loading;
  expect(controller.closed).toBe(true);
  expect(controller.results).toEqual([]);
  const failure = browser({
    read: async () => ({ status: "unavailable", message: "broken" })
  }).controller;
  await failure.activate();
  expect(failure.status).toBe("unavailable");
  expect(failure.snapshot).toBeUndefined();
  const empty = browser({ read: async () => collection() }).controller;
  await empty.activate();
  expect(empty.snapshot?.entries).toEqual([]);
  const noMatches = browser().controller;
  await noMatches.activate();
  noMatches.setQuery("zzzzzzzzzzzzzzzz");
  await vi.waitFor(() => expect(noMatches.searching).toBe(false));
  expect(noMatches.status).toBe("ready");
  expect(noMatches.results).toEqual([]);
  expect(noMatches.snapshot?.entries.length).toBe(3);
});

it("requires two timely Delete presses and cancels confirmation on navigation, resize, and expiration", async () => {
  const { controller, ports } = browser();
  await controller.activate();
  vi.useFakeTimers();
  controller.action("delete");
  expect(controller.armed).toBeDefined();
  controller.action("ignore");
  expect(controller.armed).toBeDefined();
  controller.action("down");
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  controller.resize();
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  await vi.advanceTimersByTimeAsync(1500);
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  expect(ports.remove).not.toHaveBeenCalled();
  controller.action("delete");
  await Promise.resolve();
  expect(ports.remove).toHaveBeenCalledTimes(1);
});

it("freezes during deletion, preserves failed selection/query/preview, and allows a fresh attempt", async () => {
  const pending = deferred<MutationResult>();
  const remove = vi.fn(() => pending.promise);
  const { controller } = browser({ remove });
  await controller.activate();
  controller.action("preview");
  controller.action("delete");
  controller.action("delete");
  const selected = controller.selected;
  controller.action("down");
  controller.action("switch");
  controller.setQuery("changed");
  expect(controller.selected).toBe(selected);
  expect(controller.query).toBe("");
  expect(controller.collection).toBe("drafts");
  pending.resolve({ status: "failed", message: "busy" });
  await vi.waitFor(() => expect(controller.deleting).toBe(false));
  expect(controller.preview).toBe(true);
  expect(controller.selected).toBe(selected);
  controller.action("delete");
  controller.action("delete");
  expect(remove).toHaveBeenCalledTimes(2);
});

it("refreshes from committed deletion, selects a nearby occurrence, and never reopens after close", async () => {
  const pending = deferred<MutationResult>();
  const { controller, snapshot, ports } = browser({ remove: () => pending.promise });
  await controller.activate();
  controller.action("down");
  controller.action("delete");
  controller.action("delete");
  pending.resolve({
    status: "committed",
    snapshot: collection([snapshot.entries[0]!.source, snapshot.entries[2]!.source]),
    warnings: []
  });
  await vi.waitFor(() => expect(controller.results).toHaveLength(2));
  expect(controller.selected?.occurrence.source).toBe(snapshot.entries[2]?.source);
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  controller.action("delete");
  controller.action("cancel");
  await Promise.resolve();
  expect(controller.closed).toBe(true);
  expect(ports.close).toHaveBeenCalledTimes(1);
});

it("standalone inspection copies/scrolls but cannot restore/delete/switch; confirm closes", async () => {
  const { controller, ports } = browser({}, 2);
  await controller.activate();
  expect(controller.preview).toBe(true);
  expect(controller.selected?.occurrence.number).toBe(2);
  controller.action("copy");
  controller.action("delete");
  controller.action("delete");
  controller.action("switch");
  controller.action("restore-remove");
  expect(ports.copy).toHaveBeenCalledTimes(1);
  expect(ports.restore).not.toHaveBeenCalled();
  expect(ports.remove).not.toHaveBeenCalled();
  expect(controller.collection).toBe("drafts");
  controller.action("confirm");
  expect(controller.closed).toBe(true);
});

it("honors configured precedence, reserves Ctrl+C from cancel, and disables shadowed controls", () => {
  const keys = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.input.copy": ["ctrl+x", "escape"],
    "tui.select.cancel": ["ctrl+c", "escape"],
    "tui.select.confirm": ["ctrl+p", "delete"],
    "tui.select.down": "tab"
  });
  expect(actionFor("\x1b", keys)).toBe("copy");
  expect(actionFor("\x03", keys)).toBe("ignore");
  expect(actionFor("\x10", keys)).toBe("confirm");
  expect(actionFor("\t", keys)).toBe("down");
  expect(actionFor("\x1b[3~", keys)).toBe("confirm");
  expect(usableCancelKeys(keys)).toEqual([]);
  expect(fixedHints(keys, true).join()).not.toContain("ctrl+p");
  const normal = new KeybindingsManager(TUI_KEYBINDINGS);
  expect(actionFor("\x03", normal)).toBe("copy");
  expect(actionFor("\x1b[3;1:2~", normal)).toBe("ignore");
  expect(actionFor("\x1b[3;1:3~", normal)).toBe("ignore");
  expect(usableCancelKeys(normal)).toEqual(["escape"]);
});
