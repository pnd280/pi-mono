import { expect, it, vi } from "vite-plus/test";

import { OwnedHooks } from "./index.ts";

it("unwinds repeated replacements in reverse order", () => {
  const hooks = new OwnedHooks();
  const target: { value?: number } = {};
  hooks.replace(target, "value", 1);
  hooks.replace(target, "value", 2);
  hooks.restore();
  expect(Object.hasOwn(target, "value")).toBe(false);
});

it("preserves later values and accessor replacements without invoking getters, and continues past a locked property", () => {
  const hooks = new OwnedHooks();
  const target = { restored: 1, later: 2, accessor: 3, locked: 4 };
  hooks.replace(target, "restored", 5);
  hooks.replace(target, "later", 6);
  hooks.replace(target, "accessor", 7);
  hooks.replace(target, "locked", 8);
  target.later = 9;
  const get = vi.fn(() => 10);
  Object.defineProperty(target, "accessor", { get });
  // Restoration runs in reverse order, so the locked property fails first.
  Object.defineProperty(target, "locked", { configurable: false, writable: false });
  hooks.restore();
  expect(target.restored).toBe(1);
  expect(target.later).toBe(9);
  expect(Object.getOwnPropertyDescriptor(target, "accessor")).toMatchObject({ get });
  expect(get).not.toHaveBeenCalled();
  expect(Object.getOwnPropertyDescriptor(target, "locked")).toMatchObject({ value: 8 });
});
