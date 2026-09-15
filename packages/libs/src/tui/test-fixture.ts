import type {
  Theme,
  KeybindingsManager as HostKeybindingsManager
} from "@earendil-works/pi-coding-agent";
import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  TuiMainScreen,
  type Terminal
} from "@earendil-works/pi-tui";

// The browser consumes only fg/bold and inherited key matching. These small host
// fakes avoid loading themes or keybinding files from an agent directory.
const browserTheme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const testTheme = browserTheme as Theme;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const testKeys = new KeybindingsManager(TUI_KEYBINDINGS) as HostKeybindingsManager;

export function createTestTui() {
  const terminal: Terminal = {
    start() {},
    stop() {},
    drainInput: async () => {},
    write() {},
    columns: 80,
    rows: 24,
    kittyProtocolActive: false,
    moveBy() {},
    hideCursor() {},
    showCursor() {},
    clearLine() {},
    clearFromCursor() {},
    clearScreen() {},
    setTitle() {},
    setProgress() {}
  };

  return new TuiMainScreen(terminal);
}
