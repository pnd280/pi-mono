import { TuiMainScreen, type Terminal } from "@earendil-works/pi-tui";

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
