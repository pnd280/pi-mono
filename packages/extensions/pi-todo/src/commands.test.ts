import type { AutocompleteProvider, Component } from "@earendil-works/pi-tui";
import { openResponsiveCustomUI } from "@pi-mono/libs/tui/responsive-custom-ui";
import { expect, it, vi } from "vite-plus/test";

import {
  getTodosArgumentCompletions,
  runTodosCommand,
  TodosCustomViewHost,
  todosArgumentAutocompleteProvider
} from "./commands.ts";
import { TodoController } from "./controller.ts";
import { TodoOverlay } from "./todo-overlay.ts";

vi.mock("@pi-mono/libs/tui/responsive-custom-ui", () => ({ openResponsiveCustomUI: vi.fn() }));

it("settles session/agent cancellation and host failures with exactly one suppression release", async () => {
  const release = vi.fn();
  const suppress = vi.fn(() => ({ release }));
  const host = new TodosCustomViewHost({ suppress });
  const controller = new TodoController();

  const custom = async () => {
    throw new Error("Unexpected direct host call");
  };

  const notify = vi.fn();
  const ui = { custom, notify };
  const open = vi.mocked(openResponsiveCustomUI);
  open.mockImplementation(
    ({ signal }) =>
      new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      })
  );
  const first = host.show({ ui, signal: undefined }, controller);
  open.mock.calls.at(-1)?.[0].onInputRoutingUnavailable?.();
  expect(notify.mock.lastCall?.[1]).toBe("warning");
  host.shutdown();
  host.shutdown();
  await first;
  expect(release).toHaveBeenCalledTimes(1);
  await host.show({ ui, signal: undefined }, controller);
  expect(suppress).toHaveBeenCalledTimes(1);
  host.start();
  const abort = new AbortController();
  const second = host.show({ ui, signal: abort.signal }, controller);
  abort.abort();
  await second;
  expect(release).toHaveBeenCalledTimes(2);
  open.mockRejectedValueOnce(new Error("host unavailable"));
  await expect(host.show({ ui, signal: undefined }, controller)).rejects.toThrow(
    "host unavailable"
  );
  expect(release).toHaveBeenCalledTimes(3);
});

it("routes widget actions, usage errors and non-TUI notifications without opening a view", async () => {
  const controller = new TodoController();
  controller.apply("create", { subject: "Root" });
  controller.apply("create", { subject: "Child", parentId: 1, blockedBy: [1] });
  const widget = new TodoOverlay(controller),
    host = new TodosCustomViewHost(widget);
  let displayedWidget: Component | undefined;
  let displayedText = "";
  widget.setUICtx({
    setWidget(_key, content) {
      if (!content) {
        displayedWidget = undefined;
        displayedText = "";

        return;
      }

      displayedWidget = content(
        {
          mode: "fullscreen",
          requestRender: () => (displayedText = displayedWidget?.render(80).join("\n") ?? "")
        },
        { fg: (_color, text) => text, strikethrough: (text) => text }
      );
      displayedText = displayedWidget.render(80).join("\n");
    },
    setActivity() {}
  });

  widget.update();

  const notify = vi.fn(),
    writeOutput = vi.fn();
  const ctx = {
    mode: "rpc" as const,
    hasUI: true,
    signal: undefined,
    ui: {
      notify,
      custom: async () => {
        throw new Error("Unexpected view");
      }
    }
  };
  const options = { widgetStateHost: widget, customViewHost: host, writeOutput };
  await runTodosCommand("", ctx, controller, options);
  expect(notify.mock.calls[0]?.[0]).toContain("Child");
  expect(notify.mock.calls[0]?.[0]).toContain("#1");
  await runTodosCommand("collapse", ctx, controller, options);
  expect(notify.mock.lastCall?.[1]).toBe("error");
  expect(displayedText).toContain("Root");
  await runTodosCommand("nope", ctx, controller, options);
  expect(notify.mock.lastCall?.[1]).toBe("error");
  expect(notify.mock.lastCall?.[0]).toContain("collapse");
  await runTodosCommand("collapse", { ...ctx, mode: "tui" }, controller, options);
  expect(displayedText).not.toBe("");
  expect(displayedText).not.toContain("Root");
  await runTodosCommand("toggle", { ...ctx, mode: "tui" }, controller, options);
  expect(displayedText).toContain("Root");
  await runTodosCommand("", { ...ctx, hasUI: false }, controller, options);
  expect(writeOutput.mock.lastCall?.[0]).toContain("interactive");
});

it("rejects widget collapse commands in regular TUI mode", async () => {
  const notify = vi.fn();
  const widgetStateHost = {
    canCollapse: () => false,
    setCollapsed: vi.fn(() => true),
    toggleCollapsed: vi.fn(() => true)
  };
  const ctx = {
    mode: "tui" as const,
    hasUI: true,
    signal: undefined,
    ui: { notify, custom: vi.fn() }
  };
  const options = {
    widgetStateHost,
    customViewHost: new TodosCustomViewHost({ suppress: vi.fn() })
  };

  for (const command of ["collapse", "expand", "toggle"]) {
    await runTodosCommand(command, ctx, new TodoController(), options);
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining("fullscreen"), "error");
  }

  expect(widgetStateHost.setCollapsed).not.toHaveBeenCalled();
  expect(widgetStateHost.toggleCollapsed).not.toHaveBeenCalled();
});

it("limits forced-Tab interception to /todos arguments and retains synchronous completions", async () => {
  expect(getTodosArgumentCompletions(" TO")?.map((item) => item.value)).toEqual(["toggle"]);
  expect(getTodosArgumentCompletions("toggle extra")).toBeNull();
  const getSuggestions = vi.fn<AutocompleteProvider["getSuggestions"]>(async () => null);
  const current: AutocompleteProvider = {
    getSuggestions,
    applyCompletion: vi.fn(),
    shouldTriggerFileCompletion: () => false
  };
  const provider = todosArgumentAutocompleteProvider(current);
  const signal = new AbortController().signal;
  await provider.getSuggestions(["/todos "], 0, 7, { signal, force: true });
  expect(getSuggestions).toHaveBeenLastCalledWith(["/todos "], 0, 7, { signal, force: false });
  await provider.getSuggestions(["/other "], 0, 7, { signal, force: true });
  expect(getSuggestions).toHaveBeenLastCalledWith(["/other "], 0, 7, { signal, force: true });
});
