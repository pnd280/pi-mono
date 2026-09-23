import { afterEach, expect, it, vi } from "vite-plus/test";

import { BrowserController } from "./controller.ts";
import { browserOptions, items, type TestItem } from "./test-fixture.ts";
import type { BrowserOptions, BrowserSnapshot } from "./types.ts";

const opened: BrowserController<TestItem>[] = [];
afterEach(() => {
  for (const controller of opened.splice(0)) controller.close();
  vi.useRealTimers();
});

function browser(options: BrowserOptions<TestItem> = browserOptions()) {
  const ports = { changed: vi.fn(), close: vi.fn(), now: Date.now, onError: vi.fn() };
  const controller = new BrowserController(options, ports);
  opened.push(controller);

  return { controller, ports };
}

it("keeps item selection during filtering and remembers independent section queries", async () => {
  const options = browserOptions();
  const third = { ...options.sections[0]!, id: "archived", label: "archived" };
  options.sections = [...options.sections, third];
  const { controller } = browser(options);
  await controller.activate();
  controller.action("down");
  controller.setQuery("beta");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.selected?.id).toBe("1");
  controller.action("switch");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.section.id).toBe("archived");
  controller.action("switch");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.section.id).toBe("recent");
  expect(controller.query).toBe("alpha");
  await controller.activate("saved");
  expect(controller.query).toBe("beta");
  expect(controller.selected?.id).toBe("1");
});

it("keeps preview open across sections with remembered queries and selections", async () => {
  const { controller } = browser();
  await controller.activate();
  controller.action("down");
  controller.setQuery("beta");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  await controller.activate("recent");
  controller.action("down");
  controller.action("preview");
  controller.action("pageDown");
  controller.action("delete");
  expect(controller.armed).toBeDefined();
  controller.action("switch");
  await vi.waitFor(() => expect(controller.status).toBe("ready"));
  expect(controller.preview).toBe(true);
  expect(controller.previewScroll).toBe(0);
  expect(controller.armed).toBeUndefined();
  expect(controller.query).toBe("beta");
  expect(controller.selected?.id).toBe("1");
  controller.action("switch");
  await vi.waitFor(() => expect(controller.status).toBe("ready"));
  expect(controller.preview).toBe(true);
  expect(controller.query).toBe("alpha");
  expect(controller.selected?.id).toBe("2");
});

it.each(["empty", "no matches", "unavailable"] as const)(
  "leaves preview when the next section has %s",
  async (outcome) => {
    const options = browserOptions();

    options.sections[0]!.load = async () => {
      if (outcome === "unavailable") throw new Error("Read failed");

      return { items: outcome === "empty" ? [] : items(["beta"]) };
    };

    const { controller } = browser(options);
    await controller.activate();
    controller.action("preview");
    controller.action("switch");
    await vi.waitFor(() => expect(controller.status).not.toBe("loading"));
    expect(controller.preview).toBe(false);
    expect(controller.selected).toBeUndefined();
    expect(controller.closed).toBe(false);
    controller.setQuery("beta");
    await vi.waitFor(() => expect(controller.searching).toBe(false));
    expect(controller.query).toBe("beta");
    if (outcome === "no matches") expect(controller.selected?.label).toBe("beta");
  }
);

it.each(["switch", "cancel"] as const)(
  "ignores obsolete preview loads after %s",
  async (action) => {
    const options = browserOptions();
    const pending = Promise.withResolvers<BrowserSnapshot<TestItem>>();
    options.sections[0]!.load = () => pending.promise;
    const { controller, ports } = browser(options);
    await controller.activate();
    controller.action("preview");
    controller.action("switch");
    expect(controller.status).toBe("loading");
    controller.action(action);
    if (action === "switch") await vi.waitFor(() => expect(controller.status).toBe("ready"));
    pending.resolve({ items: [] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    if (action === "cancel") {
      expect(controller.closed).toBe(true);
      expect(ports.close).toHaveBeenCalledTimes(1);
    } else {
      expect(controller.section.id).toBe("saved");
      expect(controller.preview).toBe(true);
      expect(controller.selected?.id).toBe("0");
    }
  }
);

it("distinguishes loading, empty, no matches and unavailable, ignoring cancelled or superseded loads", async () => {
  const read = Promise.withResolvers<BrowserSnapshot<TestItem>>();
  const options = browserOptions();
  options.sections[1]!.load = () => read.promise;
  const { controller } = browser(options);
  const pending = controller.activate();
  expect(controller.status).toBe("loading");
  await controller.activate("recent");
  read.resolve({ items: items(["stale"]) });
  await pending;
  expect(controller.section.id).toBe("recent");
  expect(controller.results.map((item) => item.label)).toEqual(["alpha", "alpha"]);

  const cancelled = Promise.withResolvers<BrowserSnapshot<TestItem>>();
  options.sections[1]!.load = () => cancelled.promise;
  const closing = controller.activate("saved");
  controller.close();
  cancelled.resolve({ items: items() });
  await closing;
  expect(controller.results).toEqual([]);
  const empty = browser(browserOptions([])).controller;
  await empty.activate();
  expect(empty.snapshot?.items).toEqual([]);
  const noMatches = browser().controller;
  await noMatches.activate();
  noMatches.setQuery("zzzzzz");
  await vi.waitFor(() => expect(noMatches.searching).toBe(false));
  expect(noMatches.status).toBe("ready");
  expect(noMatches.results).toEqual([]);
  const failed = browserOptions();

  failed.sections[1]!.load = async () => {
    throw new Error("unavailable");
  };

  const failure = browser(failed).controller;
  await failure.activate();
  expect(failure.status).toBe("unavailable");
  expect(failure.error).toBe("unavailable");
});

it("clears stale results after a search failure and recovers on the next query", async () => {
  const options = browserOptions();
  const search = options.search.bind(options);
  const failure = new Error("Search failed");
  const remove = vi.fn(async () => undefined);
  options.sections[1]!.remove!.run = remove;
  options.search = (values, query, current) =>
    query === "fail" ? Promise.reject(failure) : search(values, query, current);
  const { controller, ports } = browser(options);
  await controller.activate();
  expect(controller.selected).toBeDefined();

  controller.setQuery("fail");
  await vi.waitFor(() => expect(ports.onError).toHaveBeenCalledWith(failure));
  expect(controller.status).toBe("unavailable");
  expect(controller.error).toBe("Could not search items.");
  expect(controller.results).toEqual([]);
  expect(controller.selected).toBeUndefined();
  controller.action("delete");
  controller.action("delete");
  expect(remove).not.toHaveBeenCalled();

  controller.setQuery("beta");
  await vi.waitFor(() => expect(controller.status).toBe("ready"));
  expect(controller.error).toBe("");
  expect(controller.selected?.id).toBe("1");
});

it("aborts obsolete preparation on section changes and final closure", async () => {
  const options = browserOptions();
  const signals: AbortSignal[] = [];

  options.sections[1]!.load = async (signal) => {
    signals.push(signal);

    return { items: items() };
  };

  const { controller } = browser(options);
  await controller.activate();
  expect(signals[0]?.aborted).toBe(false);
  await controller.activate("recent");
  expect(signals[0]?.aborted).toBe(true);
  await controller.activate("saved");

  options.sections[1]!.remove!.run = async (_item, signal) => {
    expect(signal).toBe(signals[1]);
    controller.close();
    expect(signal.aborted).toBe(true);

    return undefined;
  };

  controller.action("delete");
  controller.action("delete");
  await vi.waitFor(() => expect(controller.busy).toBe(false));
  expect(controller.closed).toBe(true);
});

it("requires timely confirmation and cancels it on navigation, invalidation and expiration", async () => {
  const options = browserOptions();
  const remove = vi.fn(async () => undefined);
  options.sections[1]!.remove!.run = remove;
  const { controller } = browser(options);
  await controller.activate();
  vi.useFakeTimers();
  controller.action("delete");
  controller.action("ignore");
  expect(controller.armed).toBeDefined();
  controller.action("down");
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  controller.cancelConfirmation();
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  await vi.advanceTimersByTimeAsync(1500);
  expect(controller.armed).toBeUndefined();
  controller.action("delete");
  expect(remove).not.toHaveBeenCalled();
  controller.action("delete");
  await Promise.resolve();
  expect(remove).toHaveBeenCalledTimes(1);
});

it("freezes during removal, retains state on failure, then selects a nearby committed result", async () => {
  const values = items();
  const options = browserOptions(values);
  const pending = Promise.withResolvers<BrowserSnapshot<TestItem> | undefined>();
  options.sections[1]!.remove!.run = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ items: [values[0], values[2]] });
  const { controller } = browser(options);
  await controller.activate();
  controller.action("down");
  controller.action("preview");
  controller.action("delete");
  controller.action("delete");
  const selected = controller.selected;
  controller.action("down");
  controller.action("switch");
  controller.setQuery("changed");
  expect(controller.selected).toBe(selected);
  expect(controller.query).toBe("");
  expect(controller.section.id).toBe("saved");
  pending.resolve(undefined);
  await vi.waitFor(() => expect(controller.busy).toBe(false));
  expect(controller.preview).toBe(true);
  expect(controller.selected).toBe(selected);
  controller.action("delete");
  controller.action("delete");
  await vi.waitFor(() => expect(controller.results).toHaveLength(2));
  expect(controller.selected?.id).toBe("2");
  expect(controller.preview).toBe(false);
});

it("does not publish completed mutations after close", async () => {
  const options = browserOptions();
  const removal = Promise.withResolvers<BrowserSnapshot<TestItem> | undefined>();
  options.sections[1]!.remove!.run = () => removal.promise;
  const { controller, ports } = browser(options);
  await controller.activate();
  controller.action("preview");
  controller.action("delete");
  controller.action("delete");
  controller.action("cancel");
  expect(controller.closed).toBe(true);
  const previous = controller.snapshot;
  removal.resolve({ items: [] });
  await vi.waitFor(() => expect(controller.busy).toBe(false));
  expect(controller.snapshot).toBe(previous);
  expect(ports.close).toHaveBeenCalledTimes(1);
});

it.each(["accept", "refuse", "reject", "cancel"] as const)(
  "handles %s during an asynchronous selection action",
  async (outcome) => {
    const options = browserOptions();
    const pending = Promise.withResolvers<void>();
    const failure = new Error("Action failed");

    options.sections[1]!.confirm!.run = async () => {
      await pending.promise;
      if (outcome === "reject") throw failure;

      return outcome !== "refuse";
    };

    const { controller, ports } = browser(options);
    await controller.activate();
    const selected = controller.selected;
    controller.action("confirm");
    expect(controller.busy).toBe(true);
    controller.action("down");
    controller.action("switch");
    controller.setQuery("changed");
    expect(controller.selected).toBe(selected);
    expect(controller.section.id).toBe("saved");
    expect(controller.query).toBe("");
    if (outcome === "cancel") controller.action("cancel");
    pending.resolve();
    await vi.waitFor(() => expect(controller.busy).toBe(false));
    expect(controller.closed).toBe(outcome === "accept" || outcome === "cancel");
    expect(ports.close).toHaveBeenCalledTimes(controller.closed ? 1 : 0);
    if (outcome === "reject") expect(ports.onError).toHaveBeenCalledWith(failure);
    else expect(ports.onError).not.toHaveBeenCalled();
  }
);

it("reports synchronous copy failures without closing the browser", async () => {
  const options = browserOptions();
  const failure = new Error("Copy failed");

  options.sections[1]!.copy = () => {
    throw failure;
  };

  const { controller, ports } = browser(options);
  await controller.activate();
  expect(() => controller.action("copy")).not.toThrow();
  expect(ports.onError).toHaveBeenCalledWith(failure);
  expect(controller.closed).toBe(false);
});

it("supports inspection without permitting selection, removal, or section switching", async () => {
  const options = browserOptions();
  options.inspection = { index: 2, title: "Item inspection", missingMessage: "Missing item" };
  const section = options.sections[1]!;
  const copy = vi.fn(async () => {});
  const confirm = vi.fn(() => true);
  const remove = vi.fn(async () => undefined);
  section.copy = copy;
  section.confirm!.run = confirm;
  section.remove!.run = remove;
  const { controller } = browser(options);
  await controller.activate();
  expect(controller.preview).toBe(true);
  expect(controller.selected?.id).toBe("1");
  controller.action("copy");
  controller.action("delete");
  controller.action("delete");
  controller.action("switch");
  controller.action("alternate");
  expect(copy).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(controller.section.id).toBe("saved");
  controller.action("confirm");
  expect(controller.closed).toBe(true);
});

it("honors missing actions and item eligibility and permits selection refusal", async () => {
  const options = browserOptions();
  const section = options.sections[1]!;
  const remove = vi.fn(async () => undefined);
  section.remove!.enabled = () => false;
  section.remove!.run = remove;
  section.confirm!.run = () => false;
  delete section.alternate;
  const { controller } = browser(options);
  await controller.activate();
  controller.action("delete");
  controller.action("delete");
  controller.action("alternate");
  controller.action("confirm");
  expect(remove).not.toHaveBeenCalled();
  expect(controller.armed).toBeUndefined();
  expect(controller.closed).toBe(false);
});
