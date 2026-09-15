import { KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { expect, it } from "vite-plus/test";

import { BrowserControls } from "./controls.ts";

it("honors precedence, reserves Ctrl+C from cancellation, and omits shadowed fixed hints", () => {
  const controls = new BrowserControls(
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.input.copy": ["ctrl+x", "escape"],
      "tui.select.cancel": ["ctrl+c", "escape"],
      "tui.select.confirm": ["ctrl+p", "delete"],
      "tui.select.down": "tab"
    })
  );
  expect(controls.actionFor("\x1b")).toBe("copy");
  expect(controls.actionFor("\x03")).toBe("ignore");
  expect(controls.actionFor("\x10")).toBe("confirm");
  expect(controls.actionFor("\t")).toBe("down");
  expect(controls.actionFor("\x1b[3~")).toBe("confirm");
  expect(controls.actionFor("\x1b[3;1:2~")).toBe("confirm");
  expect(controls.key("cancel")).toBeUndefined();
  expect(controls.hint("preview", "preview")).toBeUndefined();
  expect(controls.hint("delete", "remove")).toBeUndefined();
  expect(controls.hint("switch", "view")).toBe("Shift+Tab view");
  expect(controls.actionFor("\x1b[Z")).toBe("switch");
  const normal = new BrowserControls(new KeybindingsManager(TUI_KEYBINDINGS));
  expect(normal.actionFor("\x03")).toBe("copy");
  expect(normal.actionFor("\x1b[3;1:2~")).toBe("ignore");
  expect(normal.actionFor("\x1b[3;1:3~")).toBe("ignore");
  expect(normal.key("cancel")).toBe("Esc");
});

it("advertises the first effective alternatives and labels unavailable configured actions", () => {
  const controls = new BrowserControls(
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.input.copy": ["enter", "up"],
      "tui.select.cancel": ["ctrl+c", "enter", "escape"],
      "tui.select.confirm": ["enter", "ctrl+y"],
      "tui.select.up": "up",
      "tui.select.down": ["ctrl+y", "ctrl+n"]
    })
  );
  expect(controls.hint("confirm", "restore")).toBe("Ctrl+Y restore");
  expect(controls.actionFor("\x19")).toBe("confirm");
  expect(controls.hint("cancel", "close")).toBe("Esc close");
  expect(controls.actionFor("\x1b")).toBe("cancel");
  expect(controls.navigationHints("navigate")).toEqual([
    "navigate up unavailable",
    "Ctrl+N navigate down"
  ]);
  expect(controls.actionFor("\x0e")).toBe("down");
});

it("allows another configured action to use Ctrl+C when cancellation cannot", () => {
  const controls = new BrowserControls(
    new KeybindingsManager(TUI_KEYBINDINGS, {
      "tui.input.copy": [],
      "tui.select.cancel": ["ctrl+c", "escape"],
      "tui.select.confirm": "ctrl+c"
    })
  );
  expect(controls.hint("copy", "copy")).toBe("copy unavailable");
  expect(controls.hint("confirm", "restore")).toBe("Ctrl+C restore");
  expect(controls.actionFor("\x03")).toBe("confirm");
  expect(controls.actionFor("\x1b")).toBe("cancel");
});
