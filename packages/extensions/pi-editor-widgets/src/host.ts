import { createHash, randomUUID } from "node:crypto";

import {
  InteractiveMode,
  VERSION,
  type AgentSession,
  type ExtensionContext,
  type ReadonlyFooterDataProvider
} from "@earendil-works/pi-coding-agent";
import {
  TuiAltScreen,
  TuiMainScreen,
  type Component,
  type Container,
  type TUI
} from "@earendil-works/pi-tui";
import { OwnedHooks, unwrapHook } from "@pi-mono/libs/owned-hooks";

type NativeComponent = Component & { dispose?(): void };

export type WidgetHost = {
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
};

type StatusPrototype = { setExtensionStatus: ExtensionContext["ui"]["setStatus"] };

export const inspectedPiVersion = "1.4.0";

// Inspected Pi 1.4.0 API and bundled CLI sources, respectively. Keep the owner in
// .agents/skills/pi-update/scripts/fingerprints.ts in sync with these methods.
const hostHashes = {
  switchTuiMode: new Set([
    "71c592580432ca0373dfd085c2a6649e2a3898e1017a43151dbce8d9e895d3eb",
    "d14d77b49560495945b6fb5f191e480b9dee7c2d0573f664f058680df948d986"
  ]),
  setExtensionStatus: new Set([
    "ad79cf9f6010ac37f4bed982f5a73dd61c221b63323e85d9378df5394eabccdd",
    "333ac42db2bee3ccd39eb8d424bb34b532102bc7ca7c8ca959bc272cfabafed7"
  ]),
  renderWidgets: new Set([
    "5434521502ddd847bad4f8a859550477a4227c60de82b4a1d550444322df12d1",
    "6ddf873c24a53757073891532df6c9beda3fb76641670a152e8f3c72bda33bad"
  ]),
  setExtensionFooter: new Set([
    "7eed76ffc30d64b63edf638c82d2571b1f95ce637cf7daf3f5537afd9f2ae5cc",
    "f37882eace0d7aa8fe719440cb51d57134ca33652d811d84ffcce2460f199112"
  ]),
  createExtensionUIContext: new Set([
    "9d4e6324456b3fbeafc0164acdce2495d40f8807cf969986761ef6e7e82cf45a",
    "d5a9dc7b63e0b1be41091d34aae592c0a7451d86eaa837b97bdae81c5d34e49f"
  ])
};

const rendererHashes = new Set([
  "eb29b13e99a79b269c976c39a30e22afa773d54179ce39275036d05361cb01c8",
  "646cf1cfe9000f4829e89ade7674496fce65852353ab820c7eafccf86bfa4cb7",
  "d72907c9a878f4e729638f3887954ba7b73ba1d65581d31c25e69cee886651ad",
  "32657b82ce120ddfe4c9cd486867fea7fd7120d7871061ce1010ada325d9c94a"
]);

function hookCompatible(value: unknown, hashes: ReadonlySet<string>): boolean {
  const method = unwrapHook(value);

  return (
    typeof method === "function" &&
    (hashes.has(
      createHash("sha256").update(Function.prototype.toString.call(method)).digest("hex")
    ) ||
      VERSION === inspectedPiVersion)
  );
}

/** Unknown wrappers need the inspected version; provenance alone cannot identify native code. */
export function widgetHostMethodsCompatible(host: object): boolean {
  return Object.entries(hostHashes).every(([name, hashes]) =>
    hookCompatible(Reflect.get(host, name), hashes)
  );
}

/** Check the actual renderer again whenever Pi replaces it. */
export function widgetRendererCompatible(renderer: object): boolean {
  return hookCompatible(Reflect.get(renderer, "doRender"), rendererHashes);
}

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
    widgetHostMethodsCompatible(value) &&
    renderer !== null &&
    typeof renderer === "object" &&
    widgetRendererCompatible(renderer) &&
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
  if (
    !widgetHostMethodsCompatible(prototype) ||
    !widgetRendererCompatible(TuiMainScreen.prototype) ||
    !widgetRendererCompatible(TuiAltScreen.prototype)
  )
    return undefined;
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
