import { KeybindingsManager, TUI_KEYBINDINGS, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { browserLayout } from "./layout.ts";
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
  const view = new Browser(options, {
    tui,
    keys,
    close,
    onError: vi.fn(),
    theme: { fg: (_color, text) => text, bold: (text) => text }
  });
  opened.push(view);

  return { view, options, controller: view.controller, tui, close };
}

it("claims resolved paging only, including loading and undersized views", () => {
  const { view, tui } = browser(
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
  tui.terminal.rows = 5;
  view.render(20);
  expect(view.ownsFullscreenInput("\x0e")).toBe(true);
  const selected = view.controller.selectedIndex;
  view.handleInput("\x0e");
  expect(view.controller.selectedIndex).toBe(selected);
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
  [0, true, 0],
  [10, true, 7],
  [18, true, 13],
  [19, false, 12],
  [24, false, 15]
])("calculates presentation at %i terminal rows", (rows, overlay, height) => {
  expect(browserLayout(rows)).toEqual({ overlay, height });
});

it.each([
  [80, 24],
  [40, 10],
  [150, 40]
])("bounds the list, preview and confirmation at %i×%i", async (width, height) => {
  const { view, controller, tui } = browser(
    Array.from({ length: 30 }, (_, index) => `row-${index} ${"界 multiline\n".repeat(50)}`)
  );
  tui.terminal.rows = height!;
  await controller.activate();

  const render = () => {
    const lines = view.render(width);
    expect(lines.length).toBeLessThanOrEqual(browserLayout(tui.terminal.rows).height);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);

    return lines;
  };

  const baseline = render();
  controller.action("down");
  const beforeConfirmation = render();
  expect(beforeConfirmation).toHaveLength(baseline.length);
  vi.useFakeTimers();
  controller.action("delete");
  const confirmation = render();
  expect(confirmation.join()).toContain("Delete again");
  expect(confirmation.filter((line) => line.includes("row-"))).toEqual(
    beforeConfirmation.filter((line) => line.includes("row-"))
  );
  await vi.advanceTimersByTimeAsync(1500);
  expect(controller.armed).toBeUndefined();
  vi.useRealTimers();
  controller.action("preview");
  await vi.waitFor(() => expect(render().join()).not.toContain("Preparing full preview"));
  controller.action("pageDown", 1000);
  render();
  expect(controller.previewScroll).toBeGreaterThan(0);
  tui.terminal.rows = 18;
  render();
});

it.each(["confirm", "alternate", "delete"] as const)(
  "shows only closure and accurate feedback during pending %s",
  async (action) => {
    const { view, options, controller, close } = browser();
    const pending = Promise.withResolvers<void>();
    const section = options.sections[1]!;

    const select = async () => {
      await pending.promise;

      return false;
    };

    section.confirm!.run = select;
    section.alternate!.run = select;

    section.remove!.run = async () => {
      await pending.promise;

      return undefined;
    };

    await controller.activate();
    view.render(40);
    if (action === "delete") controller.action("delete");
    controller.action(action);
    const output = view.render(40).join("\n");
    expect(output).toContain(action === "delete" ? "Removing item…" : "Working…");
    expect(output).toContain("Esc close");
    for (const hint of ["Enter select", "Ctrl+C copy", "Tab view", "Del×2", "Alt+Enter"])
      expect(output).not.toContain(hint);
    view.handleInput("\x1b");
    expect(close).toHaveBeenCalledOnce();
    pending.resolve();
    await vi.waitFor(() => expect(controller.busy).toBe(false));
  }
);

it("omits item actions without a ready selection and deletion for ineligible items", async () => {
  const { view, options, controller } = browser();
  const output = () => view.render(80).join("\n");
  expect(output()).not.toContain("Enter select");
  expect(output()).not.toContain("Ctrl+C copy");
  expect(output()).toContain("Tab view");
  options.sections[1]!.remove!.enabled = () => false;
  await controller.activate();
  expect(output()).toContain("Enter select");
  expect(output()).not.toContain("Del×2");
  controller.setQuery("no matches");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(output()).toContain("No search matches.");
  for (const hint of ["Enter select", "Ctrl+C copy", "Ctrl+P preview", "Alt+Enter"])
    expect(output()).not.toContain(hint);
});

it("retains collection identity beside recovery status in compact layouts", async () => {
  const { view, options, controller, tui } = browser();
  options.sections[1]!.load = async () => ({ items: items(), message: "Read-only: repair IDs." });
  tui.terminal.rows = 10;
  await controller.activate();
  const rows = view.render(40);
  expect(rows.join("\n")).toContain("recent | saved");
  expect(rows.join("\n")).toContain("Read-only: repair IDs.");
  expect(rows.length).toBeLessThanOrEqual(browserLayout(10).height);
});

it("sanitizes confirmation overflow before rendering it", async () => {
  const { view, options, controller, tui } = browser();
  tui.terminal.rows = 10;
  options.sections[1]!.remove!.confirmation = `\x1b]52;c;YQ==\x07${"confirm ".repeat(100)}`;
  await controller.activate();
  view.render(40);
  controller.action("delete");
  const output = view.render(40).join("\n");
  expect(output).not.toContain("\x1b]52;");
  expect(output).toContain("confirm");
});

it("preserves search cursor edits and action hints during pending search", async () => {
  const { view, options, controller } = browser(["abXc"]);
  await controller.activate();
  view.focused = true;
  view.render(80);
  view.handleInput("abc");
  view.handleInput("\x1b[D");
  view.handleInput("X");
  expect(controller.query).toBe("abXc");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  const pending = Promise.withResolvers<TestItem[]>();
  options.search = () => pending.promise;
  view.handleInput("d");
  expect(controller.searching).toBe(true);
  const output = view.render(80).join("\n");
  expect(output).toContain("Enter select");
  expect(output).toContain("Ctrl+C copy");
  pending.resolve([]);
  await vi.waitFor(() => expect(controller.searching).toBe(false));
});

it("preserves section queries and advertises only available actions and switching keys", async () => {
  const keys = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "tab" });
  const { view, options, controller } = browser(["alpha", "beta"], keys);
  delete options.sections[1]!.alternate;
  delete options.sections[1]!.remove;
  await controller.activate();
  const lines = view.render(80).join("\n");
  expect(lines).toContain("Shift+Tab view");
  expect(lines).not.toContain("Alt+Enter");
  expect(lines).not.toContain("Del×2");
  view.handleInput("beta");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  view.handleInput("\x1b[Z");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.section.id).toBe("recent");
  expect(controller.query).toBe("alpha");
  view.handleInput("\x1b[Z");
  await vi.waitFor(() => expect(controller.searching).toBe(false));
  expect(controller.query).toBe("beta");
});

it("cancels confirmation on resize and remains cancellable below minimum dimensions", async () => {
  const { view, controller, tui, close } = browser();
  await controller.activate();
  view.render(80);
  controller.action("delete");
  tui.terminal.rows = 9;
  expect(view.render(39).join()).toContain("Resize");
  expect(controller.armed).toBeUndefined();
  view.handleInput("\x1b");
  expect(close).toHaveBeenCalledTimes(1);
  expect(view.render(80)).toEqual([]);
});

it.each([
  [80, 24, "\t"],
  [40, 10, "\x1b[Z"]
] as const)("switches collections within preview at %i×%i", async (width, height, switching) => {
  const { view, options, controller, tui, close } = browser([
    "alpha\nrecent detail",
    "saved\ndraft detail"
  ]);
  tui.terminal.rows = height;
  await controller.activate();
  view.render(width);
  view.handleInput("\x1b[B");
  view.handleInput("\x10");
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("  draft detail"));
  const preview = view.render(width).join("\n");
  expect(preview).toContain("Tab view");
  expect(preview.indexOf("Tab view")).toBeGreaterThan(preview.indexOf("draft detail"));
  expect(preview).not.toContain("view (recent/saved)");
  const loading = Promise.withResolvers<void>();
  const load = options.sections[0]!.load.bind(options.sections[0]);

  options.sections[0]!.load = async (signal) => {
    await loading.promise;

    return load(signal);
  };

  view.handleInput(switching);
  expect(view.render(width).join("\n")).toContain("Esc close");
  loading.resolve();
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("  recent detail"));
  expect(controller.section.id).toBe("recent");
  expect(controller.preview).toBe(true);
  expect(view.render(width).join("\n")).toContain("Esc back");
  view.handleInput(switching);
  await vi.waitFor(() => expect(view.render(width).join("\n")).toContain("  draft detail"));
  expect(controller.section.id).toBe("saved");
  view.handleInput("\x1b");
  expect(controller.preview).toBe(false);
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
  const { view, options, controller, close } = browser(undefined, keys);
  const copy = vi.fn(async () => {});
  const select = vi.fn(() => true);
  options.sections[1]!.copy = copy;
  options.sections[1]!.confirm!.run = select;
  await controller.activate();
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

it("renders literal-plus shortcuts and refuses a browser without an effective cancel key", async () => {
  const { view, controller } = browser(
    undefined,
    new KeybindingsManager(TUI_KEYBINDINGS, { "tui.input.copy": "+" })
  );
  await controller.activate();
  expect(view.render(40).join()).toContain("+ copy");
  view.handleInput("\x1b");
  expect(controller.closed).toBe(true);
  expect(() =>
    browser(undefined, new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.cancel": "ctrl+c" }))
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
