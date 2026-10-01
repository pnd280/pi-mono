import { initTheme } from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  stripTerminalSequences,
  TUI_KEYBINDINGS,
  visibleWidth
} from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { TodosCustomViewHost } from "./commands.ts";
import { TodoController } from "./controller.ts";
import { TodosView } from "./todos-view.ts";

beforeAll(() => initTheme("dark", false));

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  strikethrough: (text: string) => text
};

it("keeps list and detail rows within short and narrow terminal dimensions", () => {
  const terminal = { rows: 24 };
  const view = new TodosView({
    tasks: Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      subject: `Long todo subject ${index + 1}`,
      status: "pending",
      description: "A long description line.\n".repeat(20)
    })),
    theme,
    tui: { requestRender() {}, terminal },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
    done: vi.fn()
  });

  for (const detail of [false, true]) {
    if (detail) view.handleInput("\r");

    for (const [width, height] of [
      [80, 24],
      [40, 10],
      [20, 7],
      [20, 3]
    ] as const) {
      terminal.rows = height;
      const lines = view.render(width);
      expect(lines.length, `${width}x${height}, detail=${detail}`).toBeLessThanOrEqual(height);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(lines.join("\n")).toContain(detail ? "Long todo subject 1" : "pending");
    }
  }
});

it("keeps close controls visible in a short regular-mode overlay", async () => {
  const fixture = await hostFixture();
  const controller = new TodoController();
  controller.apply("create", { subject: "Visible todo" });
  const view = new TodosCustomViewHost({ suppress: () => ({ release() {} }) });
  fixture.terminal.rows = 7;
  const write = vi.spyOn(fixture.host.ui.terminal, "write");
  fixture.host.ui.start();
  const opening = view.show({ ui: fixture.ui, signal: undefined }, controller);

  try {
    await vi.waitFor(() => expect(fixture.host.ui.hasOverlay()).toBe(true));
    write.mockClear();
    fixture.host.ui.renderNow(true);
    expect(stripTerminalSequences(write.mock.calls.flat().join(""))).toContain("Esc close");
  } finally {
    view.shutdown();
    await opening;
    await fixture.dispose();
  }
});

it("uses configured selection paging for the list and details", () => {
  const view = new TodosView({
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      subject: `Todo ${index + 1}`,
      status: "pending",
      description: Array.from({ length: 50 }, (_, line) => `Detail line ${line + 1}`).join("\n")
    })),
    theme,
    tui: { requestRender() {}, terminal: { rows: 40 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.pageDown": "ctrl+n",
      "tui.select.pageUp": "ctrl+p",
      "tui.editor.pageDown": [],
      "tui.editor.pageUp": []
    }),
    done: vi.fn()
  });
  view.render(80);
  expect(view.ownsFullscreenInput("\x0e")).toBe(true);
  expect(view.ownsFullscreenInput("\x10")).toBe(true);
  expect(view.ownsFullscreenInput("\x1b[6~")).toBe(false);
  view.handleInput("\x0e");
  view.handleInput("\r");
  const pagedSelection = /Todo #(\d+)/u.exec(view.render(80).join("\n"));
  expect(Number(pagedSelection?.[1])).toBeGreaterThan(2);
  view.handleInput("\x1b");
  view.handleInput("\x10");
  view.handleInput("\r");
  expect(view.render(80).join("\n")).toContain("Todo #1");
  expect(view.render(80).join("\n")).toMatch(/(?:^|\n)Detail line 1(?:\n|$)/u);
  view.handleInput("\x0e");
  expect(view.render(80).join("\n")).not.toMatch(/(?:^|\n)Detail line 1(?:\n|$)/u);
  view.handleInput("\x10");
  expect(view.render(80).join("\n")).toMatch(/(?:^|\n)Detail line 1(?:\n|$)/u);
  view.handleInput("\x1b");
  expect(view.render(80).join("\n")).toContain("#1 Todo 1");
});

it("claims only effective paging actions and reserves control keys", () => {
  const keys = new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.select.pageDown": ["escape", "enter", "down", "pageDown"],
    "tui.select.pageUp": []
  });
  const view = new TodosView({
    tasks: [{ id: 1, subject: "Todo", status: "pending" }],
    theme,
    tui: { requestRender() {}, terminal: { rows: 24 } },
    keybindings: keys,
    done: vi.fn()
  });
  for (const input of ["\x1b", "\r", "\x1b[B", "\x1b[5~", "x", "\x1b[6;1:3~"])
    expect(view.ownsFullscreenInput(input)).toBe(false);
  expect(view.ownsFullscreenInput("\x1b[6~")).toBe(true);
  expect(view.ownsFullscreenInput("\x1b[6;1:2~")).toBe(true);
  expect(view.ownsFullscreenInput("\x1b[13;1:3u")).toBe(false);
  view.handleInput("\r");
  expect(view.ownsFullscreenInput("\x1b[6~")).toBe(true);
});

it("shares dispatch precedence for ambiguous terminal encodings in lists and details", () => {
  const done = vi.fn();
  const view = new TodosView({
    tasks: [
      {
        id: 1,
        subject: "Todo",
        status: "pending",
        description: Array.from({ length: 50 }, (_, line) => `Detail ${line + 1}`).join("\n")
      }
    ],
    theme,
    tui: { requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.pageDown": ["ctrl+[", "ctrl+m", "ctrl+n"]
    }),
    done
  });
  view.render(80);
  // Legacy terminals encode Ctrl+[ as Escape and Ctrl+M as Enter.
  expect(view.ownsFullscreenInput("\x1b")).toBe(false);
  expect(view.ownsFullscreenInput("\r")).toBe(false);
  expect(view.ownsFullscreenInput("\x0e")).toBe(true);
  view.handleInput("\r");
  expect(view.render(80).join("\n")).toMatch(/(?:^|\n)Detail 1(?:\n|$)/u);
  expect(view.ownsFullscreenInput("\x1b")).toBe(false);
  expect(view.ownsFullscreenInput("\r")).toBe(false);
  view.handleInput("\r");
  expect(view.render(80).join("\n")).toMatch(/(?:^|\n)Detail 1(?:\n|$)/u);
  view.handleInput("\x0e");
  expect(view.render(80).join("\n")).not.toMatch(/(?:^|\n)Detail 1(?:\n|$)/u);
  view.handleInput("\x1b");
  expect(view.render(80).join("\n")).toContain("#1 Todo");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(done).toHaveBeenCalledOnce();
});

it("resolves conflicting configured todo controls without using Ctrl+C to cancel", () => {
  const done = vi.fn();
  const view = new TodosView({
    tasks: [{ id: 1, subject: "Todo", status: "pending" }],
    theme,
    tui: { requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.cancel": ["ctrl+c", "escape"],
      "tui.select.confirm": ["escape", "ctrl+y"]
    }),
    done
  });

  view.handleInput("\x03");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x19");
  expect(view.render(80).join("\n")).toContain("Todo #1");
  view.handleInput("\x1b");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(done).toHaveBeenCalledOnce();
});

it.each([{ cancel: [] }, { cancel: ["ctrl+c"] }] as const)(
  "refuses to open without a usable cancel binding: $cancel",
  ({ cancel }) => {
    expect(
      () =>
        new TodosView({
          tasks: [],
          theme,
          tui: { requestRender() {}, terminal: { rows: 24 } },
          keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
            "tui.select.cancel": [...cancel]
          }),
          done: vi.fn()
        })
    ).toThrow("tui.select.cancel");
  }
);

it("selects hierarchy preorder, opens read-only details, returns, and ignores Ctrl+C", () => {
  const done = vi.fn();
  const view = new TodosView({
    tasks: [
      { id: 1, subject: "Root", status: "pending" },
      { id: 2, subject: "Other", status: "pending" },
      { id: 3, subject: "Child", status: "completed", parentId: 1, description: "Detail text" }
    ],
    theme,
    tui: { requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
    done
  });
  view.render(80);
  view.handleInput("\x1b[B");
  view.handleInput("\r");
  const detail = view.render(80).join("\n");
  expect(detail).toContain("Todo #3");
  expect(detail).toContain("Detail text");
  expect(detail).toContain("Parent: #1");
  view.handleInput("\x03");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(view.render(80).join("\n")).not.toContain("Todo #3");
  view.handleInput("\x1b");
  expect(done).toHaveBeenCalledOnce();
});
