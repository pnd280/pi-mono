import { expect, it, vi } from "vite-plus/test";

import { OwnedHooks } from "./index.ts";

it("restores original descriptors and removes temporary shadows of inherited methods", () => {
  const hooks = new OwnedHooks();
  const target = { value: 1 };
  Object.defineProperty(target, "value", { enumerable: false });
  const descriptor = Object.getOwnPropertyDescriptor(target, "value");
  hooks.replace(target, "value", 2);

  class Host {
    handle() {
      return "original";
    }
  }

  const host = new Host();
  hooks.replace(host, "handle", () => "replacement");
  expect(host.handle()).toBe("replacement");
  expect(target.value).toBe(2);
  hooks.restore();
  expect(Object.getOwnPropertyDescriptor(target, "value")).toEqual(descriptor);
  expect(Object.hasOwn(host, "handle")).toBe(false);
  expect(host.handle()).toBe("original");
});

it("unwinds repeated replacements in reverse order and consumes restorations only once", () => {
  const hooks = new OwnedHooks();
  const target: { value?: number } = {};
  hooks.replace(target, "value", 1);
  hooks.replace(target, "value", 2);
  hooks.restore();
  expect(Object.hasOwn(target, "value")).toBe(false);
  target.value = 3;
  hooks.restore();
  expect(target.value).toBe(3);
});

it("preserves later values and accessor replacements without invoking getters", () => {
  const hooks = new OwnedHooks();
  const target = { first: 1, second: 2 };
  hooks.replace(target, "first", 3);
  hooks.replace(target, "second", 4);
  target.first = 5;
  const get = vi.fn(() => 6);
  Object.defineProperty(target, "second", { get });
  hooks.restore();
  expect(target.first).toBe(5);
  expect(Object.getOwnPropertyDescriptor(target, "second")).toMatchObject({ get });
  expect(get).not.toHaveBeenCalled();
});

it("continues restoring other properties when a later owner locks one", () => {
  const hooks = new OwnedHooks();
  const target = { first: 1, second: 2 };
  hooks.replace(target, "first", 3);
  hooks.replace(target, "second", 4);
  Object.defineProperty(target, "second", { configurable: false, writable: false });
  hooks.restore();
  expect(target).toEqual({ first: 1, second: 4 });
});

it("refuses own accessors and nonwritable data properties without changing them", () => {
  const hooks = new OwnedHooks();
  const set = vi.fn();
  const target = { first: 1, second: 2 };
  Object.defineProperty(target, "first", { get: () => 1, set });
  Object.defineProperty(target, "second", { writable: false });
  expect(() => hooks.replace(target, "first", 3)).toThrow("writable data properties");
  expect(() => hooks.replace(target, "second", 4)).toThrow("writable data properties");
  hooks.restore();
  expect(set).not.toHaveBeenCalled();
  expect(target).toEqual({ first: 1, second: 2 });
});
