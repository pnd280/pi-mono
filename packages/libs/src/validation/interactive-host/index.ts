import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { type Component, type Container, type TUI, type Terminal } from "@earendil-works/pi-tui";
import { vi } from "vite-plus/test";

export type NativeComponent = Component & { dispose?(): void };

export interface FixtureHost {
  session: AgentSession;
  ui: TUI;
  renderer: TUI;
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
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
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
  initTheme("dark");
  const runtime = { session, setBeforeSessionInvalidate() {}, setRebindSession() {} };
  const terminal = {
    columns: 80,
    rows: 24,
    kittyProtocolActive: false,
    async drainInput() {},
    setProgress() {},
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
  // Use Pi's actual fixed input dock in fullscreen without startup downloads or signal handlers.
  const viewportUrl = new URL(
    "./modes/interactive/chat-viewport.js",
    import.meta.resolve("@earendil-works/pi-coding-agent")
  );
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const viewportModule = (await import(viewportUrl.href)) as {
    createChatViewport(options: Record<string, Component>): { root: Component };
  };
  host.fullscreenLayoutRoot = viewportModule.createChatViewport({
    document: host.documentContainer,
    pendingMessages: host.pendingMessagesContainer,
    status: host.statusContainer,
    widgetsAbove: host.widgetContainerAbove,
    editor: host.editorContainer,
    widgetsBelow: host.widgetContainerBelow,
    footer: host.footerContainer
  }).root;
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

  return {
    host,
    ui,
    session,
    directory,
    agentDir,
    terminal,
    async bind() {
      await session.bindExtensions({ uiContext: ui, mode: "tui" });
    },
    async dispose() {
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
      host.clearExtensionWidgets();
      host.setExtensionFooter(undefined);
      host.footerDataProvider.dispose();
      host.ui.stop();
      session.dispose();
      await rm(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  };
}
