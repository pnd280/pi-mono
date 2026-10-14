import type {
  ExtensionContext,
  Theme,
  KeybindingsManager as HostKeybindingsManager
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  KeybindingsManager,
  ScrollView,
  TUI_KEYBINDINGS,
  TuiAltScreen,
  TuiMainScreen,
  VStack,
  type Component,
  type Terminal,
  type TuiMode
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

function createTestTerminal() {
  let input = (_data: string) => {};

  const terminal: Terminal = {
    start(callback) {
      input = callback;
    },
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
    setProgress() {},
    setProgramStatus() {}
  };

  return { terminal, send: (data: string) => input(data) };
}

export function createTestTui() {
  return new TuiMainScreen(createTestTerminal().terminal);
}

/** Real renderer dispatch/focus, with Pi's asynchronous custom-UI mounting order. */
export function createInputHost(mode: TuiMode = "fullscreen") {
  const { terminal, send } = createTestTerminal();
  const tui = mode === "fullscreen" ? new TuiAltScreen(terminal) : new TuiMainScreen(terminal);
  const transcript = new ScrollView(
    {
      render: () => Array.from({ length: 100 }, (_, index) => `Transcript ${index}`),
      invalidate() {}
    },
    { primary: true, scrollbar: "hidden" }
  );
  const editor = { render: () => ["editor"], invalidate() {}, focused: false };
  const dock = new Container();
  dock.addChild(editor);
  const root = new VStack([
    { component: transcript, grow: 1, basis: 0 },
    { component: dock, basis: "auto" }
  ]);
  tui.addChild(root);
  if (tui instanceof TuiAltScreen) tui.setLayoutRoot(root);
  tui.setFocus(editor);
  tui.start();
  let presentation: (Component & { dispose?(): void }) | undefined;
  const ui: Pick<ExtensionContext["ui"], "custom"> = {
    custom: (factory, options) =>
      new Promise((resolve, reject) => {
        let closed = false;
        let current: typeof presentation;

        const done = (result: Parameters<Parameters<typeof factory>[3]>[0]) => {
          if (closed) return;
          closed = true;

          if (options?.overlay) tui.hideOverlay();
          else {
            dock.clear();
            dock.addChild(editor);
            tui.setFocus(editor);
          }

          resolve(result);
          current?.dispose?.();
        };

        void Promise.resolve(factory(tui, testTheme, testKeys, done)).then((component) => {
          if (closed) return;
          current = component;
          presentation = component;

          if (options?.overlay) options.onHandle?.(tui.showOverlay(component));
          else {
            dock.clear();
            dock.addChild(component);
            tui.setFocus(component);
          }

          tui.renderNow();
        }, reject);
      })
  };

  return {
    tui,
    terminal,
    transcript,
    editor,
    dock,
    ui,
    send,
    get presentation() {
      return presentation;
    },
    render: () => tui.renderNow(),
    dispose: () => {
      presentation?.dispose?.();
      tui.stop();
    }
  };
}
