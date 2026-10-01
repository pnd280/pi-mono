import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { browserOptions, items, type TestItem } from "./test-fixture.ts";
import { Browser } from "./view.ts";

const opened: Browser<TestItem>[] = [];
afterEach(() => {
  for (const view of opened.splice(0)) view.dispose();
  vi.useRealTimers();
});

function browser(
  texts?: string[],
  keys = new KeybindingsManager(TUI_KEYBINDINGS),
  cancelError?: Error
) {
  const options = browserOptions(items(texts));
  if (cancelError) options.cancelError = cancelError;
  const tui = { terminal: { rows: 24 }, requestRender: vi.fn() };
  const close = vi.fn();
  const onError = vi.fn();
  const view = new Browser(options, {
    tui,
    keys,
    close,
    onError,
    theme: { fg: (_color, text) => text, bold: (text) => text }
  });
  opened.push(view);

  return { view, options, tui, close, onError };
}

it("claims resolved paging only, including loading and undersized views", async () => {
  const { view, options, tui } = browser(
    undefined,
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.input.copy": "pageUp",
      "tui.select.pageUp": ["pageUp", "ctrl+y"],
      "tui.select.pageDown": ["escape", "enter", "down", "ctrl+n"]
    })
  );
  for (const data of ["\x1b[5~", "\x1b", "\r", "\x1b[B", "\x1b[6~", "x", "\x1b[110;5:3u"])
    expect(view.ownsFullscreenInput(data)).toBe(false);
  for (const data of ["\x19", "\x0e", "\x1b[110;5:2u"])
    expect(view.ownsFullscreenInput(data)).toBe(true);
  const loading = Promise.withResolvers<void>();

  options.sections[1]!.load = async () => {
    await loading.promise;

    return { items: items() };
  };

  const select = vi.fn(() => false);
  options.sections[1]!.confirm!.run = select;
  const activation = view.activate();
  expect(view.render(80).join()).toContain("Loading collection");
  view.handleInput("\x0e");
  loading.resolve();
  await activation;
  tui.terminal.rows = 5;
  view.render(20);
  expect(view.ownsFullscreenInput("\x0e")).toBe(true);
  view.handleInput("\x0e");
  tui.terminal.rows = 24;
  view.render(80);
  view.handleInput("\r");
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }));
  const disabled = browser(
    undefined,
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.pageUp": [],
      "tui.select.pageDown": []
    })
  );
  expect(disabled.view.ownsFullscreenInput("\x1b[5~")).toBe(false);
  expect(disabled.view.ownsFullscreenInput("\x1b[6~")).toBe(false);
});

it.each([
  [80, 24],
  [40, 10],
  [150, 40]
])("bounds the list, preview and confirmation at %i×%i", async (width, height) => {
  const { view, tui } = browser(
    Array.from(
      { length: 30 },
      (_, index) =>
        `row-${index}\n${Array.from({ length: 100 }, (_, line) => `detail-${index}-${line} 界 multiline`).join("\n")}`
    )
  );
  tui.terminal.rows = height!;
  await view.activate();

  const render = () => {
    const lines = view.render(width);
    expect(lines.length).toBeLessThanOrEqual(tui.terminal.rows);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);

    return lines;
  };

  render();
  view.handleInput("\x1b[B");
  const beforeConfirmation = render();
  vi.useFakeTimers();
  view.handleInput("\x1b[3~");
  const confirmation = render();
  expect(confirmation.join()).toContain("Delete again");
  expect(confirmation.filter((line) => line.includes("row-"))).toEqual(
    beforeConfirmation.filter((line) => line.includes("row-"))
  );
  await vi.advanceTimersByTimeAsync(1500);
  expect(render().join()).not.toContain("Delete again");
  vi.useRealTimers();
  view.handleInput("\x10");
  await vi.waitFor(() => expect(render().join()).not.toContain("Preparing full preview"));
  const firstDetail = () =>
    render()
      .join("\n")
      .match(/detail-1-\d+/)?.[0];
  const beforePaging = firstDetail();
  view.handleInput("\x1b[6~");
  expect(firstDetail()).toMatch(/^detail-1-\d+$/);
  expect(firstDetail()).not.toBe(beforePaging);
  tui.terminal.rows = 18;
  render();
});

it.each(["confirm", "alternate", "delete"] as const)(
  "shows only closure and accurate feedback during pending %s",
  async (action) => {
    const { view, options, tui, close, onError } = browser();
    const pending = Promise.withResolvers<void>();
    const section = options.sections[1]!;

    const select = vi.fn(async () => {
      await pending.promise;

      return false;
    });

    section.confirm!.run = select;
    section.alternate!.run = select;

    const remove = vi.fn(async () => {
      await pending.promise;

      return undefined;
    });
    section.remove!.run = remove;

    await view.activate();
    view.render(40);
    if (action === "delete") view.handleInput("\x1b[3~");
    view.handleInput({ confirm: "\r", alternate: "\x1b\r", delete: "\x1b[3~" }[action]);
    if (action === "delete")
      expect(remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: "0" }),
        expect.any(AbortSignal)
      );
    else expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }));
    const output = view.render(40).join("\n");
    expect(output).toContain(action === "delete" ? "Removing item…" : "Working…");
    expect(output).toContain("Esc close");
    for (const hint of ["Enter select", "Ctrl+C copy", "Tab view", "Del×2", "Alt+Enter"])
      expect(output).not.toContain(hint);
    view.handleInput("\x1b");
    expect(close).toHaveBeenCalledOnce();
    const redraws = tui.requestRender.mock.calls.length;
    pending.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(view.render(40)).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    expect(tui.requestRender).toHaveBeenCalledTimes(redraws);
    expect(onError).not.toHaveBeenCalled();
  }
);

it("omits item actions without a ready selection and deletion for ineligible items", async () => {
  const { view, options } = browser();
  const output = () => view.render(80).join("\n");
  expect(output()).not.toContain("Enter select");
  expect(output()).not.toContain("Ctrl+C copy");
  expect(output()).toContain("Tab view");
  options.sections[1]!.remove!.enabled = () => false;
  await view.activate();
  expect(output()).toContain("Enter select");
  expect(output()).not.toContain("Del×2");
  view.handleInput("no matches");
  await vi.waitFor(() => expect(output()).toContain("No search matches."));
  for (const hint of ["Enter select", "Ctrl+C copy", "Ctrl+P preview", "Alt+Enter"])
    expect(output()).not.toContain(hint);
});

it("retains collection identity beside recovery status in compact layouts", async () => {
  const { view, options, tui } = browser();
  options.sections[1]!.load = async () => ({ items: items(), message: "Read-only: repair IDs." });
  tui.terminal.rows = 10;
  await view.activate();
  const rows = view.render(40);
  expect(rows.join("\n")).toContain("recent | saved");
  expect(rows.join("\n")).toContain("Read-only: repair IDs.");
  expect(rows.length).toBeLessThanOrEqual(10);
});

it("sanitizes confirmation overflow before rendering it", async () => {
  const { view, options, tui } = browser();
  tui.terminal.rows = 10;
  options.sections[1]!.remove!.confirmation = `\x1b]52;c;YQ==\x07${"confirm ".repeat(100)}`;
  await view.activate();
  view.render(40);
  view.handleInput("\x1b[3~");
  const output = view.render(40).join("\n");
  expect(output).not.toContain("\x1b]52;");
  expect(output).toContain("confirm");
});

it("preserves search cursor edits and action hints during pending search", async () => {
  const { view, options } = browser(["abXc"]);
  const search = vi.fn(options.search.bind(options));
  options.search = search;
  const copy = vi.fn(async () => {});
  options.sections[1]!.copy = copy;
  await view.activate();
  view.focused = true;
  expect(view.focused).toBe(true);
  view.render(80);
  view.handleInput("abc");
  view.handleInput("\x1b[D");
  view.handleInput("X");
  expect(search).toHaveBeenLastCalledWith(expect.any(Array), "abXc", expect.any(Function));
  await vi.waitFor(() => {
    view.handleInput("\x03");
    expect(copy).toHaveBeenCalledWith(expect.objectContaining({ label: "abXc" }));
  });
  const pending = Promise.withResolvers<TestItem[]>();
  const pendingSearch = vi.fn(() => pending.promise);
  options.search = pendingSearch;
  view.handleInput("d");
  expect(pendingSearch).toHaveBeenCalledWith(expect.any(Array), "abXdc", expect.any(Function));
  const output = view.render(80).join("\n");
  expect(output).toContain("Enter select");
  expect(output).toContain("Ctrl+C copy");
  pending.resolve([]);
  await vi.waitFor(() => expect(view.render(80).join()).toContain("No search matches."));
  view.focused = false;
  expect(view.focused).toBe(false);
});

it("preserves section queries and advertises only available actions and switching keys", async () => {
  const keys = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "tab" });
  const { view, options } = browser(["alpha", "beta"], keys);
  const search = vi.fn(options.search.bind(options));
  options.search = search;
  const recentCopy = vi.fn(async () => {});
  const savedCopy = vi.fn(async () => {});
  options.sections[0]!.copy = recentCopy;
  options.sections[1]!.copy = savedCopy;
  delete options.sections[1]!.alternate;
  delete options.sections[1]!.remove;
  await view.activate();
  const lines = view.render(80).join("\n");
  expect(lines).toContain("Shift+Tab view");
  expect(lines).not.toContain("Alt+Enter");
  expect(lines).not.toContain("Del×2");
  view.handleInput("beta");
  await vi.waitFor(() => expect(view.render(80).join()).not.toContain("alpha"));
  view.handleInput("\x1b[Z");
  await vi.waitFor(() => {
    const output = view.render(80).join();
    expect(output).toContain("alpha");
    expect(output).not.toContain("Loading collection");
    expect(output).not.toContain("beta");
  });
  expect(search).toHaveBeenLastCalledWith(expect.any(Array), "alpha", expect.any(Function));
  view.handleInput("\x03");
  expect(recentCopy).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }));
  view.handleInput("\x1b[Z");
  await vi.waitFor(() => {
    const output = view.render(80).join();
    expect(output).toContain("beta");
    expect(output).not.toContain("Loading collection");
    expect(output).not.toContain("alpha");
  });
  expect(search).toHaveBeenLastCalledWith(expect.any(Array), "beta", expect.any(Function));
  view.handleInput("\x03");
  expect(savedCopy).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
});

it("cancels confirmation on resize and remains cancellable below minimum dimensions", async () => {
  const { view, options, tui, close } = browser();
  const remove = vi.fn(async () => undefined);
  options.sections[1]!.remove!.run = remove;
  await view.activate();
  view.render(80);
  view.handleInput("\x1b[3~");
  tui.terminal.rows = 9;
  expect(view.render(39).join()).toContain("Resize");
  tui.terminal.rows = 24;
  expect(view.render(80).join()).not.toContain("Delete again");
  view.handleInput("\x1b[3~");
  expect(remove).not.toHaveBeenCalled();
  expect(view.render(80).join()).toContain("Delete again");
  tui.terminal.rows = 9;
  view.render(39);
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledTimes(1);
  expect(view.render(80)).toEqual([]);
});

it("invalidates confirmation without aborting the active collection or losing selection", async () => {
  const { view, options, close } = browser();
  let activationSignal: AbortSignal | undefined;

  options.sections[1]!.load = async (signal) => {
    activationSignal = signal;

    return { items: items() };
  };

  const remove = vi.fn(async () => undefined);
  const copy = vi.fn(async () => {});
  options.sections[1]!.remove!.run = remove;
  options.sections[1]!.copy = copy;
  await view.activate();
  view.render(80);
  view.handleInput("\x1b[B");
  view.handleInput("\x1b[3~");
  expect(view.render(80).join()).toContain("Delete again");
  view.invalidate();
  expect(view.render(80).join()).not.toContain("Delete again");
  expect(activationSignal?.aborted).toBe(false);
  view.handleInput("\x1b[3~");
  expect(remove).not.toHaveBeenCalled();
  view.handleInput("\x03");
  expect(copy).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  expect(close).not.toHaveBeenCalled();
});

it("disposes a loading browser exactly once and suppresses late preparation", async () => {
  const { view, options, tui, close, onError } = browser();
  const loading = Promise.withResolvers<void>();
  let activationSignal: AbortSignal | undefined;

  options.sections[1]!.load = async (signal) => {
    activationSignal = signal;
    await loading.promise;

    return { items: items(["late result"]) };
  };

  const activation = view.activate();
  expect(view.render(80).join()).toContain("Loading collection");
  view.dispose();
  view.dispose();
  expect(activationSignal?.aborted).toBe(true);
  const redraws = tui.requestRender.mock.calls.length;
  loading.resolve();
  await activation;
  await view.activate();
  expect(view.render(80)).toEqual([]);
  expect(close).toHaveBeenCalledOnce();
  expect(tui.requestRender).toHaveBeenCalledTimes(redraws);
  expect(onError).not.toHaveBeenCalled();
});

it.each([
  [80, 24, "\t"],
  [40, 10, "\x1b[Z"]
] as const)("switches collections within preview at %i×%i", async (width, height, switching) => {
  const { view, options, tui, close } = browser(["alpha\nrecent detail", "saved\ndraft detail"]);
  tui.terminal.rows = height;
  const recentSelect = vi.fn(() => false);
  const savedSelect = vi.fn(() => false);
  options.sections[0]!.confirm!.run = recentSelect;
  options.sections[1]!.confirm!.run = savedSelect;
  await view.activate();
  view.render(width);
  view.handleInput("\x1b[B");
  view.handleInput("\x10");
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("draft detail"));
  const preview = view.render(width).join("\n");
  expect(preview).toContain("Tab view");
  const loading = Promise.withResolvers<void>();
  const load = options.sections[0]!.load.bind(options.sections[0]);

  options.sections[0]!.load = async (signal) => {
    await loading.promise;

    return load(signal);
  };

  view.handleInput(switching);
  expect(view.render(width).join("\n")).toContain("Esc close");
  loading.resolve();
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("recent detail"));
  view.handleInput("\r");
  expect(recentSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }));
  expect(view.render(width).join("\n")).toContain("Esc back");
  view.handleInput(switching);
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("draft detail"));
  view.handleInput("\r");
  expect(savedSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  view.handleInput("\x1b");
  expect(view.render(width).join()).toContain("Esc close");
  expect(view.render(width).join()).not.toContain("Esc back");
  expect(close).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledTimes(1);
});

it.each([
  { confirm: ["enter"] as const, hint: "select unavailable", input: undefined },
  { confirm: ["enter", "ctrl+y"] as const, hint: "Ctrl+Y select", input: "\x19" }
])("advertises effective confirm bindings: $hint", async ({ confirm, hint, input }) => {
  const keys = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.input.copy": "enter",
    "tui.select.confirm": [...confirm]
  });
  const { view, options, close } = browser(undefined, keys);
  const copy = vi.fn(async () => {});
  const select = vi.fn(() => true);
  options.sections[1]!.copy = copy;
  options.sections[1]!.confirm!.run = select;
  await view.activate();
  const output = view.render(80).join("\n");
  expect(output).toContain(hint);
  expect(output).toContain("Enter copy");
  expect(output).not.toContain("Enter select");
  view.handleInput("\r");
  expect(copy).toHaveBeenCalledTimes(1);
  expect(select).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();

  if (input) {
    view.handleInput(input);
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(select).toHaveBeenCalledTimes(1);
  }
});

it("omits undispatchable shortcuts and refuses a browser without an effective cancel key", async () => {
  const { view, close } = browser(
    undefined,
    new KeybindingsManager(TUI_KEYBINDINGS, { "tui.input.copy": "+" })
  );
  await view.activate();
  expect(view.render(40).join()).toContain("copy unavailable");
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledOnce();
  expect(view.render(40)).toEqual([]);
  for (const key of ["ctrl+c", "+", "shift+escape", "ctrl+f1"] as const)
    expect(() =>
      browser(undefined, new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.cancel": key }))
    ).toThrow("cancel binding");
  class ConfigurationError extends Error {}
  expect(() =>
    browser(
      undefined,
      new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.cancel": "ctrl+c" }),
      new ConfigurationError("Fix browser bindings.")
    )
  ).toThrow(ConfigurationError);
});
