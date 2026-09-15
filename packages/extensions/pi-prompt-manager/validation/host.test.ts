import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createAgentSession,
  DefaultResourceLoader,
  initTheme,
  type KeybindingsManager as HostKeybindingsManager,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ExtensionContext
} from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS, type Component } from "@earendil-works/pi-tui";
import { afterEach, expect, it, vi } from "vite-plus/test";

import promptManager from "../index.ts";
import { deferred, workspace } from "../src/test-fixture.ts";
import { createTestTui } from "./test-terminal.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllEnvs();
});

async function host(mode: ExtensionContext["mode"], before?: (pi: ExtensionAPI) => void) {
  const fixture = await workspace();
  // Remove storage made by the test helper so mode guards can prove no feature I/O.
  await rm(join(fixture.agentDir, "pi-prompt-manager"), { recursive: true });
  vi.stubEnv("PI_CODING_AGENT_DIR", fixture.agentDir);
  vi.stubEnv("PI_OFFLINE", "1");
  await writeFile(
    join(fixture.agentDir, "settings.json"),
    JSON.stringify({ "ext.pi-prompt-manager": { customMessageTypes: ["allow"] } })
  );
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false }
  });
  const registrations: string[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
    noPromptTemplates: true,
    extensionFactories: [
      (pi) => {
        before?.(pi);
        const command = pi.registerCommand.bind(pi);

        pi.registerCommand = (name, options) => {
          registrations.push(name);
          command(name, options);
        };

        const shortcut = pi.registerShortcut.bind(pi);

        pi.registerShortcut = (key, options) => {
          registrations.push(key);
          shortcut(key, options);
        };

        promptManager(pi);
      }
    ]
  });
  await resourceLoader.reload();
  expect(resourceLoader.getExtensions().errors).toEqual([]);
  expect(registrations).toEqual([]);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(fixture.agentDir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(fixture.agentDir, "models-store.json"),
    refreshOnCreate: false,
    allowModelNetwork: false
  });
  const { session } = await createAgentSession({
    cwd: fixture.cwd,
    agentDir: fixture.agentDir,
    settingsManager,
    resourceLoader,
    modelRuntime,
    sessionManager: SessionManager.inMemory(fixture.cwd),
    noTools: "all"
  });
  cleanups.push(async () => {
    await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    session.dispose();
    await rm(fixture.directory, { recursive: true, force: true });
  });
  let editor = "exact draft";
  const notify = vi.fn();
  const ui = {
    ...session.extensionRunner.createContext().ui,
    getEditorText: () => editor,
    setEditorText: (text: string) => {
      editor = text;
    },
    notify
  };
  const errors: unknown[] = [];
  await session.bindExtensions({
    mode,
    uiContext: ui,
    onError: (error) => {
      errors.push(error);
    }
  });

  return { ...fixture, session, registrations, errors, notify, getEditor: () => editor };
}

it.each(["print", "json", "rpc"] as const)(
  "does not register or touch feature storage/settings in %s mode",
  async (mode) => {
    const fixture = await host(mode);
    expect(fixture.registrations).toEqual([]);
    expect(fixture.session.extensionRunner.getCommand("prompts")).toBeUndefined();
    await fixture.session.extensionRunner.emitInput("not captured", undefined, "interactive");
    fixture.session.sessionManager.appendCustomMessageEntry("allow", "not captured", false);
    await expect(readFile(join(fixture.agentDir, "pi-prompt-manager"))).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(fixture.notify).not.toHaveBeenCalled();
    expect(fixture.errors).toEqual([]);
  }
);

it("registers at startup and reload, keeps old callbacks inert, persists without native session storage", async () => {
  const fixture = await host("tui");
  expect(fixture.registrations).toEqual(["prompts", "ctrl+r", "ctrl+shift+s"]);
  const runner = fixture.session.extensionRunner;
  const oldCommand = runner.getCommand("prompts")!;
  const oldContext = runner.createCommandContext();
  await oldCommand.handler("save", oldContext);
  expect(fixture.getEditor()).toBe("");
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
  });
  const shortcuts = runner.getShortcuts({});
  expect([...shortcuts.keys()]).toEqual(["ctrl+r", "ctrl+shift+s"]);
  expect(fixture.session.sessionManager.isPersisted()).toBe(false);
  await fixture.session.reload();
  expect(fixture.registrations).toHaveLength(6);
  await oldCommand.handler("drafts add stale", oldContext);
  expect(await fixture.repository.read("drafts")).toMatchObject({
    entries: [{ source: { text: "exact draft" } }]
  });
  expect(fixture.errors).toEqual([]);
});

function browserKeys() {
  // The browser uses inherited matches/getKeys only; this fixture does not reload keybinding files.
  // Pi exports its subclass as a type, without a public constructor.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return new KeybindingsManager(TUI_KEYBINDINGS) as HostKeybindingsManager;
}

it.each(["restore", "restore-remove", "cancel", "unsafe"] as const)(
  "handles %s across inline/overlay resizes and host editor restoration",
  async (action) => {
    const fixture = await host("tui");
    initTheme("dark", false);
    const ctx = fixture.session.extensionRunner.createCommandContext();
    const command = fixture.session.extensionRunner.getCommand("prompts")!;
    const source = action === "unsafe" ? "unsafe\x1b[2J" : "saved source";
    await command.handler(`drafts add ${source}`, ctx);
    const tui = createTestTui();
    let renderedEditor: string | undefined;
    const redraw = vi.spyOn(tui, "requestRender").mockImplementation(() => {
      renderedEditor = fixture.getEditor();
    });
    const keys = browserKeys();
    let view: (Component & { dispose?(): void }) | undefined;
    const presentations: boolean[] = [];

    ctx.ui.custom = (factory, options) => {
      const savedText = ctx.ui.getEditorText();
      const overlay = options?.overlay ?? false;
      let current: typeof view;
      let closed = false;
      presentations.push(overlay);

      return new Promise((resolve, reject) => {
        void Promise.resolve(
          factory(tui, ctx.ui.theme, keys, (result) => {
            if (closed) return;
            closed = true;
            // Match Pi 0.85.1: only inline UI restores its opening editor snapshot.
            if (overlay) tui.hideOverlay();
            else ctx.ui.setEditorText(savedText);
            tui.requestRender();
            resolve(result);
            current?.dispose?.();
          })
        ).then((component) => {
          if (closed) return;
          current = component;
          view = component;
          if (overlay) options?.onHandle?.(tui.showOverlay(component));
        }, reject);
      });
    };

    try {
      const opening = command.handler("drafts", ctx);
      await vi.waitFor(() => expect(view?.render(80).join("\n")).toContain("→ "));
      expect(presentations).toEqual([false]);

      const sizes = action === "restore-remove" ? [18, 19, 10] : [18, 19, 10, 24];

      for (const rows of sizes) {
        const previous = view!; // The preceding ready assertion requires a mounted view.
        Object.defineProperty(tui.terminal, "rows", { value: rows });
        previous.render(80);
        await vi.waitFor(() => {
          expect(view).not.toBe(previous);
          expect(view?.render(80).join("\n")).toContain("→ ");
        });
        // Disposed host adapters must not close or restore through the live presentation.
        previous.handleInput?.("\r");
        previous.dispose?.();
        expect(fixture.getEditor()).toBe("exact draft");
      }

      expect(presentations).toEqual([false, ...sizes.map((rows) => rows < 19)]);
      view?.handleInput?.(
        action === "cancel" ? "\x1b" : action === "restore-remove" ? "\x1b\r" : "\r"
      );

      if (action === "unsafe") {
        expect(fixture.getEditor()).toBe("exact draft");
        expect(fixture.notify).toHaveBeenCalledWith(expect.stringContaining("unsafe"), "error");
        view?.handleInput?.("\x1b");
      }

      await opening;
      expect(fixture.getEditor()).toBe(
        action === "cancel" || action === "unsafe" ? "exact draft" : source
      );
      expect(renderedEditor).toBe(fixture.getEditor());
      const stored = await fixture.repository.read("drafts");
      expect(stored.status === "ready" && stored.entries.length).toBe(
        action === "restore-remove" ? 0 : 1
      );
    } finally {
      view?.dispose?.();
      redraw.mockRestore();
      tui.stop();
    }
  }
);

it("expires an inspection before its small-terminal overlay mounts without popping another overlay", async () => {
  const fixture = await host("tui");
  initTheme("dark", false);
  const ctx = fixture.session.extensionRunner.createCommandContext();
  const command = fixture.session.extensionRunner.getCommand("prompts")!;
  await command.handler("drafts add saved source", ctx);
  const tui = createTestTui();
  Object.defineProperty(tui.terminal, "rows", { value: 10 });
  const other = tui.showOverlay({ render: () => ["other overlay"], invalidate() {} });
  const entered = deferred<void>();
  const mount = deferred<void>();
  const keys = browserKeys();

  ctx.ui.custom = (factory, options) =>
    new Promise((resolve, reject) => {
      void Promise.resolve(
        factory(tui, ctx.ui.theme, keys, (result) => {
          if (options?.overlay) tui.hideOverlay();
          resolve(result);
        })
      )
        .then(async (component) => {
          if (!options?.overlay) return;
          entered.resolve();
          await mount.promise;
          options.onHandle?.(tui.showOverlay(component));
        })
        .catch(reject);
    });

  const opening = command.handler("drafts show 1", ctx);

  try {
    await entered.promise;
    await fixture.session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" });
    expect(other.isFocused()).toBe(true);
    mount.resolve();
    await opening;
    expect(other.isFocused()).toBe(true);
    expect(fixture.getEditor()).toBe("exact draft");
    expect(fixture.errors).toEqual([]);
  } finally {
    mount.resolve();
    other.hide();
    tui.stop();
  }
});

it("captures transformed observed input and frozen custom-leaf eligibility without replay", async () => {
  const fixture = await host("tui", (pi) =>
    pi.on("input", (event) =>
      event.text === "before" ? { action: "transform", text: "after" } : undefined
    )
  );
  const runner = fixture.session.extensionRunner;
  await runner.emitInput("before", undefined, "interactive", "followUp");
  const sm = fixture.session.sessionManager;
  sm.appendCustomMessageEntry("unlisted", "hidden context", false);
  await runner.emitInput("eligible extension", undefined, "extension");
  sm.appendSessionInfo("metadata");
  await runner.emitInput("ineligible extension", undefined, "extension");
  sm.appendCustomMessageEntry(
    "allow",
    [
      { type: "text", text: "block one" },
      { type: "text", text: "block two" }
    ],
    false
  );
  await vi.waitFor(async () => {
    const history = await fixture.repository.read("history");
    expect(history.status === "ready" && history.entries.map((item) => item.source.text)).toEqual([
      "block one\nblock two",
      "eligible extension",
      "after"
    ]);
  });
  await fixture.session.reload();
  const history = await fixture.repository.read("history");
  expect(history.status === "ready" && history.entries.length).toBe(3);
  expect(fixture.errors).toEqual([]);
});
