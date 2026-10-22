import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  initTheme,
  InteractiveMode,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionRuntime,
  type ExtensionAPI,
  type ExtensionContext,
  type ReadonlyFooterDataProvider
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Container,
  type ScrollView,
  type TUI,
  type Terminal,
  type TuiAltScreen,
  type TuiMainScreen
} from "@earendil-works/pi-tui";
import { onTestFinished, vi } from "vite-plus/test";

import { isolateEnvironment } from "../pi-process/environment.ts";

type NativeComponent = Component & { dispose?(): void };

interface FixtureHost {
  session: AgentSession;
  ui: TUI;
  renderer: TuiAltScreen | TuiMainScreen;
  switchTuiMode(
    mode: "regular" | "fullscreen",
    restoreProgress?: boolean,
    startRenderer?: boolean
  ): boolean;
  resetExtensionUI(): void;
  documentContainer: Container;
  fullscreenLayoutRoot: Component;
  mountInteractiveTui(tui: TUI, components: Component[]): void;
  extensionWidgetsAbove: Map<string, NativeComponent>;
  extensionWidgetsBelow: Map<string, NativeComponent>;
  widgetContainerAbove: Container;
  widgetContainerBelow: Container;
  editorContainer: Container;
  statusContainer: Container;
  pendingMessagesContainer: Container;
  footerContainer: Container;
  customFooter: NativeComponent | undefined;
  footerDataProvider: ReadonlyFooterDataProvider & { dispose(): void };
  createExtensionUIContext(): ExtensionContext["ui"];
  clearExtensionWidgets(): void;
  renderWidgets(): void;
  setExtensionFooter: ExtensionContext["ui"]["setFooter"];
}

export async function hostFixture(
  factories: ((pi: ExtensionAPI) => void)[] = [],
  tuiMode: "regular" | "fullscreen" = "regular"
) {
  const directory = await mkdtemp(join(tmpdir(), "pi-interactive-host-"));
  const agentDir = join(directory, "agent");
  const resources: { session?: AgentSession; host?: FixtureHost } = {};

  const dispose = async () => {
    try {
      await resources.session?.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      resources.host?.clearExtensionWidgets();
      resources.host?.setExtensionFooter(undefined);
    } finally {
      try {
        try {
          resources.host?.footerDataProvider.dispose();
        } finally {
          try {
            resources.host?.ui.stop();
          } finally {
            resources.session?.dispose();
          }
        }
      } finally {
        try {
          await rm(directory, { recursive: true, force: true });
        } finally {
          vi.unstubAllEnvs();
        }
      }
    }
  };

  let ready = false;

  try {
    isolateEnvironment(directory);
    const settingsManager = SettingsManager.inMemory();
    const loader = new DefaultResourceLoader({
      cwd: directory,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: factories
    });
    await loader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(agentDir, "models-store.json"),
      refreshOnCreate: false,
      allowModelNetwork: false
    });
    const { session } = await createAgentSession({
      cwd: directory,
      agentDir,
      settingsManager,
      resourceLoader: loader,
      modelRuntime,
      sessionManager: SessionManager.inMemory(directory)
    });
    resources.session = session;
    initTheme("dark");
    const runtime = { session, setBeforeSessionInvalidate() {}, setRebindSession() {} };
    const terminal = {
      columns: 80,
      rows: 24,
      kittyProtocolActive: false,
      async drainInput() {},
      setProgress() {},
      setProgramStatus() {},
      start() {},
      stop() {},
      write() {},
      moveBy() {},
      hideCursor() {},
      showCursor() {},
      clearLine() {},
      clearFromCursor() {},
      clearScreen() {},
      setTitle() {}
    } satisfies Terminal;
    // Construction only consumes these runtime callbacks. Registries, renderer and UI proxy are real.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const mode = new InteractiveMode(runtime as unknown as AgentSessionRuntime, {
      terminal,
      tuiMode
    });
    // Test the installed private boundary, not a reproduction of its registration implementation.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const host = mode as unknown as FixtureHost;
    resources.host = host;
    // Use Pi's actual fixed input dock in fullscreen without startup downloads or signal handlers.
    const viewportUrl = new URL(
      "./modes/interactive/chat-viewport.js",
      import.meta.resolve("@earendil-works/pi-coding-agent")
    );
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const viewportModule = (await import(viewportUrl.href)) as {
      createChatViewport(options: Record<string, Component>): {
        root: Component;
        transcript: ScrollView;
      };
    };
    const viewport = viewportModule.createChatViewport({
      document: host.documentContainer,
      pendingMessages: host.pendingMessagesContainer,
      status: host.statusContainer,
      widgetsAbove: host.widgetContainerAbove,
      editor: host.editorContainer,
      widgetsBelow: host.widgetContainerBelow,
      footer: host.footerContainer
    });
    host.fullscreenLayoutRoot = viewport.root;
    host.mountInteractiveTui(host.renderer, [
      host.documentContainer,
      host.pendingMessagesContainer,
      host.statusContainer,
      host.widgetContainerAbove,
      host.editorContainer,
      host.widgetContainerBelow,
      host.footerContainer
    ]);
    const ui = host.createExtensionUIContext();
    ready = true;

    return {
      host,
      ui,
      session,
      modelRuntime,
      directory,
      agentDir,
      terminal,
      transcript: viewport.transcript,
      async bind() {
        await session.bindExtensions({ uiContext: ui, mode: "tui" });
      },
      dispose
    };
  } finally {
    if (!ready) await dispose();
  }
}

/** Opt-in terminal input for tests of the installed host's custom-UI lifecycle. */
export async function inputHostFixture(tuiMode: "regular" | "fullscreen" = "fullscreen") {
  const fixture = await hostFixture([], tuiMode);
  onTestFinished(fixture.dispose);
  const faux = fauxProvider({ provider: "interactive-input", models: [{ id: "offline" }] });
  fixture.modelRuntime.registerNativeProvider(faux.provider);
  await fixture.session.setModel(faux.models[0]);

  let input = (_data: string) => {};

  const terminal: Terminal = fixture.terminal;

  terminal.start = (callback) => {
    input = callback;
  };

  let presentation: Component | undefined;
  const ui: ExtensionContext["ui"] = {
    ...fixture.ui,
    custom: (factory, options) =>
      fixture.ui.custom(async (...args) => {
        const component = await factory(...args);
        presentation = component;

        return component;
      }, options)
  };
  await fixture.session.bindExtensions({ uiContext: ui, mode: "tui" });
  fixture.host.documentContainer.addChild({
    render: () => Array.from({ length: 100 }, (_, index) => `Transcript ${index}`),
    invalidate() {}
  });
  fixture.host.ui.start();

  return {
    ...fixture,
    ui,
    tui: fixture.host.renderer,
    editor: fixture.host.editorContainer.children[0],
    dock: fixture.host.editorContainer,
    get presentation() {
      return presentation;
    },
    send: (data: string) => input(data),
    render: () => fixture.host.ui.renderNow()
  };
}
