import { randomUUID } from "node:crypto";

import {
  InteractiveMode,
  type AgentSession,
  type ExtensionContext,
  type ReadonlyFooterDataProvider
} from "@earendil-works/pi-coding-agent";
import { type Component, type Container, type TUI } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

export type NativeComponent = Component & { dispose?(): void };

export interface WidgetHost {
  session: AgentSession;
  ui: TUI;
  renderer: TUI;
  switchTuiMode(
    mode: "regular" | "fullscreen",
    restoreProgress?: boolean,
    startRenderer?: boolean
  ): boolean;
  extensionWidgetsAbove: Map<string, NativeComponent>;
  extensionWidgetsBelow: Map<string, NativeComponent>;
  widgetContainerAbove: Container;
  widgetContainerBelow: Container;
  editorContainer: Container;
  statusContainer: Container;
  pendingMessagesContainer: Container;
  footerContainer: Container;
  customFooter: NativeComponent | undefined;
  footerDataProvider: ReadonlyFooterDataProvider;
  createExtensionUIContext(): ExtensionContext["ui"];
  renderWidgets(): void;
  setExtensionFooter: ExtensionContext["ui"]["setFooter"];
}

type StatusPrototype = { setExtensionStatus: ExtensionContext["ui"]["setStatus"] };

function compatible(value: unknown): value is WidgetHost {
  if (value === null || typeof value !== "object") return false;
  const get = (key: string): unknown => Reflect.get(value, key);
  const session = get("session");
  const footer = get("footerDataProvider");
  const renderer = get("renderer");
  const methods = (target: unknown, names: string[]) =>
    target !== null &&
    typeof target === "object" &&
    names.every((name) => typeof Reflect.get(target, name) === "function");

  return (
    get("extensionWidgetsAbove") instanceof Map &&
    get("extensionWidgetsBelow") instanceof Map &&
    [
      "widgetContainerAbove",
      "widgetContainerBelow",
      "editorContainer",
      "footerContainer",
      "statusContainer",
      "pendingMessagesContainer"
    ].every((key) => {
      const container = get(key);

      return (
        container !== null &&
        typeof container === "object" &&
        Array.isArray(Reflect.get(container, "children")) &&
        methods(container, ["clear", "addChild", "render"])
      );
    }) &&
    ["renderWidgets", "setExtensionFooter", "createExtensionUIContext", "switchTuiMode"].every(
      (key) => typeof get(key) === "function"
    ) &&
    methods(get("ui"), ["requestRender"]) &&
    methods(renderer, ["requestRender"]) &&
    methods(session, ["getSessionStats", "getContextUsage"]) &&
    session !== null &&
    typeof session === "object" &&
    typeof Reflect.get(session, "autoCompactionEnabled") === "boolean" &&
    methods(footer, ["getExtensionStatuses", "getGitBranch", "onBranchChange"])
  );
}

/** A synchronous no-op probe also works when /reload retains Pi's original UI closures. */
export function findWidgetHost(ui: ExtensionContext["ui"]) {
  const prototype: object = InteractiveMode.prototype;
  if (typeof Reflect.get(prototype, "setExtensionStatus") !== "function") return undefined;
  // Only this private method boundary is asserted; its receiver is checked before use.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const target = prototype as StatusPrototype;
  const original = target.setExtensionStatus;
  const hooks = new OwnedHooks();
  const key = `pi-editor-widgets:probe:${randomUUID()}`;
  let found: unknown;
  let active = true;

  try {
    hooks.replace(target, "setExtensionStatus", function (this: unknown, id, text) {
      if (active && id === key && text === undefined) {
        found = this;

        return;
      }

      original.call(this, id, text);
    });
    // Intercept before the native status registry or requestRender is touched. An unknown
    // host can at worst clear this unique, never-registered key; no existing content is removed.
    ui.setStatus(key, undefined);
  } finally {
    active = false;
    hooks.restore();
  }

  if (!compatible(found)) return undefined;
  const nativeUI = found.createExtensionUIContext();

  return { host: found, theme: () => nativeUI.theme };
}
