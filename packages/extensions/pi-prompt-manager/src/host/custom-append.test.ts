import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vite-plus/test";

import { recordedAt } from "../test-fixture.ts";
import { extensionInputEligible, installCustomAppend } from "./custom-append.ts";

it("observes newly appended exact allowlist types once, without replay or image/metadata capture", () => {
  const manager = SessionManager.inMemory("/fixture");
  manager.appendCustomMessageEntry("allowed", "old", false);
  const capture = vi.fn();
  const dispose = installCustomAppend({
    manager,
    allowlist: ["allowed"],
    capture,
    now: () => new Date(recordedAt)
  });
  expect(dispose).toBeTypeOf("function");
  expect(capture).not.toHaveBeenCalled();
  const content = [
    { type: "text" as const, text: "one" },
    { type: "image" as const, data: "ignored", mimeType: "image/png" },
    { type: "text" as const, text: "two" }
  ];
  const details = { arbitrary: true };
  const id = manager.appendCustomMessageEntry("allowed", content, false, details);
  expect(manager.getEntry(id)).toMatchObject({ content, details, display: false });
  expect(capture).toHaveBeenCalledExactlyOnceWith("one\ntwo", recordedAt);
  manager.appendCustomMessageEntry("Allowed", "no", true);
  manager.appendCustomMessageEntry(" allowed ", "no", true);
  expect(capture).toHaveBeenCalledTimes(1);
  dispose?.();
  manager.appendCustomMessageEntry("allowed", "after", false);
  expect(capture).toHaveBeenCalledTimes(1);
});

it("preserves original exceptions and behavior even if observation or clock fails", () => {
  const manager = SessionManager.inMemory();
  const failure = new Error("original exception");
  const dispose = installCustomAppend({
    manager,
    allowlist: ["type"],
    capture: () => {
      throw new Error("observer");
    },
    now: () => {
      throw new Error("clock");
    }
  });
  expect(manager.appendCustomMessageEntry("type", "still appended", true)).toBeTypeOf("string");
  const append = Object.getOwnPropertyDescriptor(manager, "_appendEntry");
  Object.defineProperty(manager, "_appendEntry", {
    configurable: true,
    value: () => {
      throw failure;
    }
  });
  expect(() => manager.appendCustomMessageEntry("type", "throws", false)).toThrow(failure);
  if (append) Object.defineProperty(manager, "_appendEntry", append);
  else Reflect.deleteProperty(manager, "_appendEntry");
  dispose?.();
});

it("restores only its own wrapper and makes retained wrappers inert", () => {
  const manager = SessionManager.inMemory();
  const capture = vi.fn();
  const dispose = installCustomAppend({
    manager,
    allowlist: ["type"],
    capture,
    now: () => new Date(recordedAt)
  });
  const retained = manager.appendCustomMessageEntry.bind(manager);
  const later = vi.fn(retained);
  manager.appendCustomMessageEntry = later;
  dispose?.();
  expect(Object.getOwnPropertyDescriptor(manager, "appendCustomMessageEntry")?.value).toBe(later);
  later("type", "after teardown", true);
  expect(capture).not.toHaveBeenCalled();
  expect(manager.getEntries()).toHaveLength(1);
  expect(
    installCustomAppend({ manager, allowlist: ["type"], capture, now: () => new Date() })
  ).toBeUndefined();
});

it("qualifies only the actual custom-message leaf, including hidden messages, never earlier ancestry", () => {
  const manager = SessionManager.inMemory();
  expect(extensionInputEligible(manager)).toBe(false);
  const custom = manager.appendCustomMessageEntry("unlisted", "hidden", false);
  expect(extensionInputEligible(manager)).toBe(true);
  manager.appendSessionInfo("metadata intervenes");
  expect(extensionInputEligible(manager)).toBe(false);
  manager.branch(custom);
  expect(extensionInputEligible(manager)).toBe(true);
  manager.appendCustomEntry("state", {});
  expect(extensionInputEligible(manager)).toBe(false);
});
