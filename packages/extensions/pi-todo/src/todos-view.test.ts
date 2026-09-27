import { initTheme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { TodosView } from "./todos-view.ts";

beforeAll(() => initTheme("dark", false));

it("uses configured selection paging for the list and details", () => {
  const view = new TodosView({
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      subject: `Todo ${index + 1}`,
      status: "pending",
      description: Array.from({ length: 50 }, (_, line) => `Detail line ${line + 1}`).join("\n")
    })),
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "fullscreen", requestRender() {}, terminal: { rows: 40 } },
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
  expect(view.render(80).join("\n")).toContain("Todo #16");
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
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "fullscreen", requestRender() {}, terminal: { rows: 24 } },
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
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "fullscreen", requestRender() {}, terminal: { rows: 24 } },
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
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
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
          theme: {
            fg: (_color, text) => text,
            bold: (text) => text,
            strikethrough: (text) => text
          },
          tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
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
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
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
