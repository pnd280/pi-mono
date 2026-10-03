import { matchesKey, type TUI, type TuiInputListener } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vite-plus/test";

import { createInputHost } from "../test-fixture.ts";
import { fullscreenInputRouting } from "./fullscreen-input.ts";
import { openResponsiveCustomUI } from "./index.ts";

function listeners(tui: TUI): Set<TuiInputListener> {
  const value: unknown = Reflect.get(tui, "inputListeners");
  if (!(value instanceof Set)) throw new Error("Fixture requires Pi's listener Set");

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Set<TuiInputListener>;
}

async function open(host = createInputHost(), claims = true) {
  const abort = new AbortController();
  const handleInput = vi.fn();
  const unavailable = vi.fn();
  const dispose = vi.fn();
  const view = { render: () => ["view"], invalidate() {}, handleInput, dispose };
  const common = { ui: host.ui, signal: abort.signal, useOverlay: () => false };
  const opening = openResponsiveCustomUI(
    claims
      ? {
          ...common,
          onInputRoutingUnavailable: unavailable,
          create: () => ({
            ...view,
            ownsFullscreenInput: (data: string) =>
              matchesKey(data, "pageUp") || matchesKey(data, "pageDown")
          })
        }
      : { ...common, create: () => view }
  );
  await vi.waitFor(() => expect(host.presentation).toBeDefined());

  return {
    host,
    handleInput,
    unavailable,
    dispose,
    close: async () => {
      abort.abort();
      await opening;
      host.dispose();
    }
  };
}

it("preserves listener order and edits, routes repeats once, and leaves retained callbacks inert", async () => {
  const host = createInputHost();
  const calls: string[] = [];

  const first = (data: string) => {
    calls.push(`first:${data}`);

    return undefined;
  };

  const second = (data: string) => {
    calls.push(`second:${data}`);

    return undefined;
  };

  host.tui.addInputListener(first);
  host.tui.addInputListener(second);
  const original = [...listeners(host.tui)];
  const view = await open(host);
  const dispatch = [...listeners(host.tui)][0]!;

  try {
    expect([...listeners(host.tui)].slice(1)).toEqual(original);
    host.send("\x1b[6~");
    host.send("\x1b[6;1:2~");
    host.send("\x1b[6;1:3~");
    expect(view.handleInput.mock.calls).toEqual([["\x1b[6~"], ["\x1b[6;1:2~"]]);
    expect(calls).toEqual([]);

    for (const data of ["x", "\x1b", "\x03", "\x1b[200~paste\x1b[201~", "\x1b[4;480;640t"]) {
      host.send(data);
      expect(calls.splice(0)).toEqual([`first:${data}`, `second:${data}`]);
    }

    host.send("\x1b[<64;1;1M"); // Still belongs to the viewport, not the custom view.
    expect(calls).toEqual([]);
    host.tui.removeInputListener(first);

    const third = () => undefined;

    host.tui.addInputListener(third);
    await view.close();
    expect([...listeners(host.tui)]).toEqual([original[0], second, third]);
    const delivered = view.handleInput.mock.calls.length;
    expect(dispatch("\x1b[6~")).toBeUndefined();
    expect(view.handleInput).toHaveBeenCalledTimes(delivered);
    expect(view.dispose).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it("tracks real focus loss, competing inline UI, overlay restoration, and transcript search", async () => {
  const view = await open();
  const { host } = view;
  const presentation = host.presentation!;
  const otherInput = vi.fn();
  const other = { render: () => ["other"], invalidate() {}, handleInput: otherInput };

  try {
    expect(host.tui.getFocusedComponent()).toBe(presentation);
    const overlay = host.tui.showOverlay(other);
    host.send("\x1b[6~");
    expect(otherInput).toHaveBeenCalledOnce();
    expect(view.handleInput).not.toHaveBeenCalled();
    // Pi restores an overlay when focus is set to its existing inline ancestor.
    host.tui.setFocus(presentation);
    host.send("\x1b[6~");
    expect(view.handleInput).not.toHaveBeenCalled();
    host.send("x"); // Unclaimed input reaches Pi's deferred focus normalization.
    expect(overlay.isFocused()).toBe(true);
    expect(otherInput).toHaveBeenCalledTimes(2);
    overlay.hide();
    host.send("\x1b[6~");
    expect(view.handleInput).toHaveBeenCalledOnce();
    host.send("\x1b[102;6u"); // Ctrl+Shift+F opens Pi's actual transcript search.
    expect(host.tui.getFocusedComponent()).not.toBe(presentation);
    host.send("\x1b[6~");
    expect(view.handleInput).toHaveBeenCalledOnce();
    host.send("\x1b");
    expect(host.tui.getFocusedComponent()).toBe(presentation);
    host.send("\x1b[6~");
    expect(view.handleInput).toHaveBeenCalledTimes(2);
    host.dock.addChild(other);
    host.tui.setFocus(other);
    host.send("\x1b[6~");
    expect(view.handleInput).toHaveBeenCalledTimes(2);
  } finally {
    await view.close();
  }
});

it("lets temporary inline UI block an existing overlay and restores that overlay on closure", async () => {
  const host = createInputHost();
  const otherInput = vi.fn();
  const overlay = host.tui.showOverlay({
    render: () => ["overlay"],
    invalidate() {},
    handleInput: otherInput
  });
  const view = await open(host);

  try {
    host.send("\x1b[6~");
    expect(view.handleInput).toHaveBeenCalledOnce();
    expect(otherInput).not.toHaveBeenCalled();
    await view.close();
    expect(overlay.isFocused()).toBe(true);
  } finally {
    await view.close();
    overlay.hide();
  }
});

it.each(["regular", "fullscreen"] as const)(
  "does not install for nonparticipants in %s mode",
  async (mode) => {
    const host = createInputHost(mode);
    const original = [...listeners(host.tui)];
    const view = await open(host, false);

    try {
      expect([...listeners(host.tui)]).toEqual(original);
    } finally {
      await view.close();
    }
  }
);

it("defers installation requested synchronously during listener traversal", async () => {
  const host = createInputHost();
  const before = [...listeners(host.tui)];
  const handleInput = vi.fn();
  const presentation = { focused: false, render: () => ["view"], invalidate() {}, handleInput };
  const routing = fullscreenInputRouting({
    tui: host.tui,
    presentation,
    eligible: () => true,
    owns: (data) => matchesKey(data, "pageDown"),
    onUnavailable: vi.fn()
  });
  const listener = vi.fn(() => {
    host.tui.setFocus(presentation);
    routing.reconcile();

    return undefined;
  });
  host.tui.addInputListener(listener);

  try {
    host.send("x");
    expect(listener).toHaveBeenCalledOnce();
    expect([...listeners(host.tui)]).toEqual([...before, listener]);
    await Promise.resolve();
    handleInput.mockClear();
    host.send("\x1b[6~");
    expect(handleInput).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    routing.dispose();
    host.dispose();
  }
});

it.each(["remove", "reorder", "copy"] as const)(
  "deactivates instead of competing with listener %s interference",
  async (change) => {
    const view = await open();
    const { host } = view;
    const collection = listeners(host.tui);
    const dispatch = collection.values().next().value!;

    try {
      if (change === "copy") Reflect.set(host.tui, "inputListeners", new Set(collection));
      else {
        collection.delete(dispatch);
        if (change === "reorder") collection.add(dispatch);
      }

      host.presentation?.render(80);
      await Promise.resolve();
      expect(view.unavailable).toHaveBeenCalledOnce();
      host.presentation?.render(80);
      host.send("\x1b[6~");
      expect(view.handleInput).not.toHaveBeenCalled();
      expect(dispatch("\x1b[6~")).toBeUndefined();
      expect(view.unavailable).toHaveBeenCalledOnce();
    } finally {
      await view.close();
    }
  }
);

it("shares one dispatcher and rebinds a stable reference without activating old-renderer callbacks", async () => {
  const oldHost = createInputHost();
  const newHost = createInputHost();
  const regular = createInputHost("regular");
  let current = oldHost.tui;
  const reference = new Proxy(oldHost.tui, {
    get: (_target, property) => {
      const value: unknown = Reflect.get(current, property);

      return typeof value === "function"
        ? (...args: unknown[]): unknown => Reflect.apply(value, current, args)
        : value;
    },
    has: (_target, property) => Reflect.has(current, property)
  });
  const input = vi.fn();
  const presentation = {
    focused: true,
    render: () => ["view"],
    invalidate() {},
    handleInput: input
  };
  const unavailable = vi.fn();
  const options = {
    tui: reference,
    presentation,
    eligible: () => true,
    owns: (data: string) => matchesKey(data, "pageDown"),
    onUnavailable: unavailable
  };
  const first = fullscreenInputRouting(options);
  const second = fullscreenInputRouting({
    ...options,
    presentation: { ...presentation, focused: false }
  });

  try {
    oldHost.tui.setFocus(presentation);
    first.reconcile();
    second.reconcile();
    await Promise.resolve();
    const oldDispatcher = listeners(oldHost.tui).values().next().value!;
    expect(listeners(oldHost.tui).size).toBe(2);
    oldHost.send("\x1b[6~");
    expect(input).toHaveBeenCalledOnce();
    second.dispose();
    expect(listeners(oldHost.tui).size).toBe(2);
    current = newHost.tui;
    current.setFocus(presentation);
    first.reconcile();
    expect(oldDispatcher("\x1b[6~")).toBeUndefined();
    await Promise.resolve();
    expect(listeners(oldHost.tui).size).toBe(1);
    newHost.send("\x1b[6~");
    expect(input).toHaveBeenCalledTimes(2);
    current = regular.tui;
    first.reconcile();
    expect(listeners(newHost.tui).size).toBe(1);
    expect(listeners(regular.tui).size).toBe(0);
    current = newHost.tui;
    first.reconcile();
    first.dispose(); // Cancel the pending reinstall.
    await Promise.resolve();
    expect(listeners(newHost.tui).size).toBe(1);
    expect(unavailable).not.toHaveBeenCalled();
  } finally {
    first.dispose();
    second.dispose();
    oldHost.dispose();
    newHost.dispose();
    regular.dispose();
  }
});
