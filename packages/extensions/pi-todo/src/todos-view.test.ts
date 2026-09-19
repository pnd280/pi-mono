import { getSettingsListTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { beforeAll, expect, it, vi } from "vite-plus/test";

import { TodosView } from "./todos-view.ts";

beforeAll(() => initTheme("dark", false));

it.each(["regular", "fullscreen"] as const)(
  "uses configured selection paging for the list and details in %s mode",
  (mode) => {
    const view = new TodosView({
      tasks: Array.from({ length: 30 }, (_, index) => ({
        id: index + 1,
        subject: `Task ${index + 1}`,
        status: "pending",
        description: Array.from({ length: 50 }, (_, line) => `Detail line ${line + 1}`).join("\n")
      })),
      theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
      tui: { mode, requestRender() {}, terminal: { rows: 40 } },
      keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
        "tui.select.pageDown": "ctrl+n",
        "tui.select.pageUp": "ctrl+p",
        "tui.editor.pageDown": [],
        "tui.editor.pageUp": []
      }),
      done: vi.fn()
    });
    const first = view.render(80);
    expect(first.join("\n")).toContain("Ctrl+P/Ctrl+N page");
    view.handleInput("\x0e");
    const settingsCursor = getSettingsListTheme().cursor;
    expect(view.render(80).find((line) => line.startsWith(settingsCursor))).toContain(
      "#16 Task 16"
    );
    view.handleInput("\x10");
    expect(view.render(80).find((line) => line.startsWith(settingsCursor))).toContain("#1 Task 1");
    view.handleInput("\r");
    const detail = view.render(80);
    view.handleInput("\x0e");
    expect(view.render(80)).not.toEqual(detail);
    view.handleInput("\x10");
    expect(view.render(80)).toEqual(detail);
    view.handleInput("\x1b");
    expect(view.render(80)).toEqual(first);
  }
);

it("keeps selection status and all essential hints visible on a narrow terminal", () => {
  const view = new TodosView({
    tasks: Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      subject: `Task ${index + 1}`,
      status: "pending"
    })),
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
    done: vi.fn()
  });

  const rendered = view.render(40).join("\n");
  expect(rendered).toContain("(1/30)");
  expect(rendered).toContain("Esc close");
  expect(rendered).toContain("PageUp/PageDown page");
  expect(rendered).toContain("↓");
});

it("resolves configured task controls in the same order as their hints", () => {
  const done = vi.fn();
  const view = new TodosView({
    tasks: [{ id: 1, subject: "Task", status: "pending" }],
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.select.cancel": ["ctrl+c", "escape"],
      "tui.select.confirm": ["escape", "ctrl+y"]
    }),
    done
  });

  expect(view.render(80).join("\n")).toContain("Ctrl+Y details");
  view.handleInput("\x19");
  expect(view.render(80).join("\n")).toContain("Task #1");
  view.handleInput("\x1b");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(done).toHaveBeenCalledOnce();
});

it("renders list rows with Pi's settings arrow and task tree markers", () => {
  const view = new TodosView({
    tasks: [
      { id: 1, subject: "Root one", status: "pending" },
      { id: 2, subject: "Root two", status: "pending" }
    ],
    theme: { fg: (_color, text) => text, bold: (text) => text, strikethrough: (text) => text },
    tui: { mode: "regular", requestRender() {}, terminal: { rows: 24 } },
    keybindings: new KeybindingsManager(TUI_KEYBINDINGS),
    done: vi.fn()
  });

  const rows = view.render(80);
  expect(rows).toContain(`${getSettingsListTheme().cursor}├─ ◦ pending · #1 Root one`);
  expect(rows).toContain("  └─ ◦ pending · #2 Root two");
});

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
  expect(detail).toContain("Task #3");
  expect(detail).toContain("Detail text");
  expect(detail).toContain("Parent: #1");
  view.handleInput("\x03");
  expect(done).not.toHaveBeenCalled();
  view.handleInput("\x1b");
  expect(view.render(80).join("\n")).not.toContain("Task #3");
  view.handleInput("\x1b");
  expect(done).toHaveBeenCalledOnce();
});
