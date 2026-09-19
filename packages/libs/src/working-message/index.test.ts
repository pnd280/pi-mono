import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBus, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, expectTypeOf, it, vi } from "vite-plus/test";

import {
  registerWorkingMessage,
  type WorkingMessageAPI,
  type WorkingMessageContext
} from "./index.ts";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runtime(events = createEventBus()) {
  const directory = mkdtempSync(join(tmpdir(), "working-message-runtime-"));
  roots.push(directory);
  vi.stubEnv("PI_CODING_AGENT_DIR", directory);
  const callbacks = new Map<string, ((event: unknown, ctx: WorkingMessageContext) => void)[]>();
  const commands = vi.fn<ExtensionAPI["registerCommand"]>();
  const api: WorkingMessageAPI = {
    events: {
      emit: (channel, data) => events.emit(channel, data),
      on: (channel, handler) => events.on(channel, handler)
    },
    registerCommand: commands,
    on: (event, handler) => callbacks.set(event, [...(callbacks.get(event) ?? []), handler])
  };
  const setWorkingMessage = vi.fn();
  const ctx: WorkingMessageContext = {
    cwd: directory,
    mode: "tui",
    isProjectTrusted: () => false,
    ui: { setWorkingMessage, notify: vi.fn() }
  };

  return {
    api,
    commands,
    setWorkingMessage,
    emit: (event: string) => {
      for (const handler of callbacks.get(event) ?? []) handler({}, ctx);
    }
  };
}

it("shares one owner across separate API wrappers and module instances, then tears it down on reload", async () => {
  expectTypeOf<ExtensionAPI>().toExtend<WorkingMessageAPI>();
  const events = createEventBus();
  const first = runtime(events);
  const second = runtime(events);
  const activity = registerWorkingMessage(first.api, {
    id: "a",
    label: "Activity",
    contributor: "first"
  });
  vi.resetModules();
  const separateModule = await import("./index.ts");
  const other = separateModule.registerWorkingMessage(second.api, {
    id: "b",
    label: "Status",
    contributor: "second"
  });
  expect(first.commands).toHaveBeenCalledOnce();
  expect(second.commands).not.toHaveBeenCalled();
  first.emit("session_start");
  second.emit("session_start");
  activity.setText("Activity");
  other.setText("Other status");
  expect(first.setWorkingMessage).toHaveBeenLastCalledWith("Activity · Other status");
  first.emit("session_shutdown");
  expect(first.setWorkingMessage).toHaveBeenLastCalledWith(undefined);
  const replacement = runtime(events);
  const fresh = registerWorkingMessage(replacement.api, {
    id: "b",
    label: "Status",
    contributor: "second"
  });
  replacement.emit("session_start");
  fresh.setText("Fresh session");
  activity.setText("Late old work");
  other.dispose();
  expect(replacement.setWorkingMessage).toHaveBeenLastCalledWith("Fresh session");
  expect(replacement.commands).toHaveBeenCalledOnce();
  replacement.emit("session_shutdown");
});
