import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { hostFixture } from "@pi-mono/libs/validation/interactive-host";
import { STEP_TIMEOUT_MS } from "@pi-mono/libs/validation/pi-process";
import { afterEach, expect, it, vi } from "vite-plus/test";

import abortGuard from "../index.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Fixture = Awaited<ReturnType<typeof hostFixture>>;

type InputHost = Fixture["host"] & {
  ui: Fixture["host"]["ui"] & { getFocusedComponent(): Component | null };
  editor: CustomEditor;
  defaultEditor: CustomEditor;
  keybindings: KeybindingsManager;
  setupKeyHandlers(): void;
  setupAutocompleteProvider(): void;
  setupExtensionShortcuts(runner: Fixture["session"]["extensionRunner"]): void;
};

async function fixture() {
  const shortcut = vi.fn();
  const result = await hostFixture([
    abortGuard,
    (pi) => {
      pi.registerShortcut("ctrl+q", { handler: shortcut });
    }
  ]);
  let ready = false;
  const finishes: (() => void)[] = [];
  const settlements: Promise<unknown>[] = [];

  const track = <T>(operation: Promise<T>) => {
    settlements.push(Promise.allSettled([operation]));

    return operation;
  };

  const dispose = async () => {
    try {
      // Close any dialog left open by a failed assertion.
      result.host.resetExtensionUI();
      // Shutdown must see armed state before stopping the active operation.
      await result.dispose();
    } finally {
      for (const finish of finishes) finish();
      await Promise.all(settlements);
    }
  };

  try {
    // The shared fixture mounts the real host without running CLI startup. Initialise its input wiring.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const host = result.host as InputHost;
    host.setupKeyHandlers();
    const paste = vi.fn();
    // Do not read the machine clipboard. CustomEditor still owns paste-key dispatch.
    host.defaultEditor.onPasteImage = paste;
    const workingMessage = vi.spyOn(result.ui, "setWorkingMessage");
    await result.bind();
    host.setupAutocompleteProvider();
    host.setupExtensionShortcuts(result.session.extensionRunner);
    // Overlap the existing shortcut and paste binding with interrupt to exercise editor precedence.
    host.keybindings.setUserBindings({ "app.interrupt": ["escape", "ctrl+q", "ctrl+v"] });
    const faux = fauxProvider();
    result.session.modelRuntime.registerNativeProvider(faux.provider);
    await result.session.setModel(faux.getModel());
    result.session.settingsManager.applyOverrides({
      compaction: { enabled: false, keepRecentTokens: 1 },
      retry: { enabled: false }
    });
    const abort = vi.spyOn(result.session, "abort");
    const press = (data = "\u001b") => host.ui.getFocusedComponent()?.handleInput?.(data);
    const hint = () => workingMessage.mock.lastCall?.[0];

    const response = (kind: "run" | "compact" | "failed-compact" | "tree" = "run") => {
      let entered = false;
      let finish!: () => void;
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      finishes.push(finish);
      faux.setResponses([
        async (_context, options) => {
          options?.signal?.addEventListener("abort", finish, { once: true });
          entered = true;

          try {
            await pending;

            return kind === "failed-compact"
              ? fauxAssistantMessage("", {
                  stopReason: "error",
                  errorMessage: "Offline summary failure"
                })
              : fauxAssistantMessage("Offline response");
          } finally {
            options?.signal?.removeEventListener("abort", finish);
          }
        }
      ]);
      if (kind === "compact" || kind === "failed-compact")
        faux.appendResponses([fauxAssistantMessage("Offline turn summary")]);

      return {
        started: () => vi.waitFor(() => expect(entered).toBe(true), { timeout: STEP_TIMEOUT_MS }),
        finish
      };
    };

    ready = true;

    return { ...result, dispose, track, host, shortcut, paste, abort, press, hint, response };
  } finally {
    if (!ready) await dispose();
  }
}

it("routes interrupts once and isolates confirmation across operations, reload, and sessions", async () => {
  // Keep confirmation inside its window even when the machine is busy.
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  const dispatch = vi.spyOn(CustomEditor.prototype, "handleInput");
  let current = await fixture();

  try {
    const run = current.response();
    const prompt = current.track(current.session.prompt("Keep working while input is routed"));
    await run.started();
    current.press("\u0011");
    expect(current.shortcut).toHaveBeenCalledTimes(1);
    expect(current.hint()).toBeUndefined();
    current.press("\u0016");
    expect(current.paste).toHaveBeenCalledTimes(1);
    expect(current.hint()).toBeUndefined();

    current.press("/");
    await vi.waitFor(() => expect(current.host.editor.isShowingAutocomplete()).toBe(true), {
      timeout: STEP_TIMEOUT_MS
    });
    current.press();
    expect(current.host.editor.isShowingAutocomplete()).toBe(false);
    expect(current.hint()).toBeUndefined();
    current.host.editor.setText("");

    const dialog = current.ui.confirm("Continue?", "The dialog owns Escape");
    await vi.waitFor(
      () => expect(current.host.ui.getFocusedComponent()).not.toBe(current.host.editor),
      { timeout: STEP_TIMEOUT_MS }
    );
    current.press();
    expect(await dialog).toBe(false);
    expect(current.hint()).toBeUndefined();

    dispatch.mockClear();
    current.press();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith("\u001b");
    expect(current.hint()).toContain("again to interrupt");
    expect(current.session.isStreaming).toBe(true);
    expect(current.abort).not.toHaveBeenCalled();
    dispatch.mockClear();
    current.press();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith("\u001b");
    await prompt;
    expect(current.abort).toHaveBeenCalledTimes(1);
    expect(current.session.messages.at(-1)).toMatchObject({ stopReason: "aborted" });

    // Finish a run with confirmation armed; the following run must need two fresh presses.
    const completed = current.response();
    const completedPrompt = current.track(current.session.prompt("Finish naturally"));
    await completed.started();
    current.press();
    completed.finish();
    await completedPrompt;
    const later = current.response();
    const laterPrompt = current.track(current.session.prompt("A later run"));
    await later.started();
    current.abort.mockClear();
    current.press();
    expect(current.abort).not.toHaveBeenCalled();
    expect(current.hint()).toContain("again to interrupt");
    later.finish();
    await laterPrompt;

    // Complete real manual compaction and tree navigation with a pending interrupt.
    for (const operation of ["compact", "failed-compact", "tree"] as const) {
      const summary = current.response(operation);
      const target = current.session.sessionManager
        .getEntries()
        .find((entry) => entry.type === "message" && entry.message.role === "user");
      expect(target).toBeDefined();
      const pending = current.track<unknown>(
        operation === "tree"
          ? current.session.navigateTree(target!.id, { summarize: true })
          : current.session.compact()
      );
      await summary.started();
      current.press();
      expect(current.hint()).toContain("again to interrupt");
      summary.finish();
      if (operation === "failed-compact")
        await expect(pending).rejects.toThrow("Offline summary failure");
      else await pending;
      const next = current.response();
      const nextPrompt = current.track(current.session.prompt(`Run after ${operation}`));
      await next.started();
      current.abort.mockClear();
      current.press();
      expect(current.abort).not.toHaveBeenCalled();
      expect(current.hint()).toContain("again to interrupt");
      next.finish();
      await nextPrompt;
    }

    const reloadSummary = current.response("compact");
    const compact = current.track(current.session.compact());
    await reloadSummary.started();
    current.press();
    await current.session.reload({ beforeSessionStart: () => current.host.resetExtensionUI() });
    reloadSummary.finish();
    await compact;
    const afterReload = current.response();
    const reloadedPrompt = current.track(current.session.prompt("Run after reload"));
    await afterReload.started();
    current.abort.mockClear();
    current.press();
    expect(current.abort).not.toHaveBeenCalled();
    expect(current.hint()).toContain("again to interrupt");
    afterReload.finish();
    await reloadedPrompt;

    const old = current.response();
    void current.track(current.session.prompt("Leave this session armed"));
    await old.started();
    current.press();
    expect(current.hint()).toContain("again to interrupt");
    await current.dispose();
    current = await fixture();
    const fresh = current.response();
    const freshPrompt = current.track(current.session.prompt("Another session"));
    await fresh.started();
    current.press();
    expect(current.abort).not.toHaveBeenCalled();
    expect(current.hint()).toContain("again to interrupt");
    fresh.finish();
    await freshPrompt;
  } finally {
    await current.dispose();
  }
});
