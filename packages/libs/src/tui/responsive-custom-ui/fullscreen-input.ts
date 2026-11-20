import {
  isKeyRelease,
  type Component,
  type Focusable,
  type TUI,
  type TuiInputListener
} from "@earendil-works/pi-tui";

import { inspectedSource } from "../../owned-hooks/index.ts";

type ListenerCollection = Set<TuiInputListener>;

type Registration = {
  reconcile(): void;
  route(data: string): boolean;
  unavailable(): void;
};

type Dispatcher = {
  listeners: ListenerCollection;
  registrations: Set<Registration>;
  dispatch: TuiInputListener;
};

const dispatchers = new WeakMap<ListenerCollection, Dispatcher>();
const ownedDispatchers = new WeakSet<TuiInputListener>();

// Pi's private overlay-restore query, reviewed against Pi 1.6.0's API build and bundled CLI. Keep .agents/skills/pi-update/scripts/fingerprints.ts in sync with this method.
const restoreFingerprints = new Set([
  "8915acfd27b165b5265683a8097d2be2f182684a3768b1cf972568a61d5a15c4",
  "57aad4c3b049665dbac2c1b6deeae4dc3b072b05f04e44550900a0cfec16df98"
]);

/** Read through the stable proxy; never use descriptor operations on it. */
function capability(tui: TUI) {
  if (!("inputListeners" in tui) || !("getFocusedComponent" in tui)) return;
  const listeners: unknown = tui.inputListeners;
  const getFocus = tui.getFocusedComponent;
  // The proxy wraps methods in forwarding closures, so hash the renderer's own method and call that.
  const getRestore: unknown = Reflect.get(
    Reflect.getPrototypeOf(tui) ?? {},
    "getVisibleOverlayFocusRestore"
  );
  if (
    !(listeners instanceof Set) ||
    typeof getFocus !== "function" ||
    typeof getRestore !== "function" ||
    !inspectedSource(getRestore, restoreFingerprints)
  )
    return;
  const focus: unknown = getFocus.call(tui);

  // Pi can restore a visible overlay after listeners run, even when current focus names an inline component. Do not preempt that pending focus handoff.
  const restore: unknown = getRestore.call(tui);
  const pendingOverlay = hasPendingOverlay(restore, focus);
  if (pendingOverlay === undefined) return;

  // Pi fills this private Set only through the typed addInputListener; keep the cast at the boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { listeners: listeners as ListenerCollection, focus: pendingOverlay ? null : focus };
}

function hasPendingOverlay(restore: unknown, focus: unknown): boolean | undefined {
  if (restore === null || typeof restore !== "object" || !("status" in restore)) return;
  if (restore.status === "inactive") return false;
  if (restore.status === "eligible") return true;
  if (restore.status === "blocked" && "blockedBy" in restore) return restore.blockedBy !== focus;

  return;
}

function intact(dispatcher: Dispatcher): boolean {
  return dispatcher.listeners.values().next().value === dispatcher.dispatch;
}

function fail(dispatcher: Dispatcher) {
  for (const registration of dispatcher.registrations) registration.unavailable();
}

function install(listeners: ListenerCollection): Dispatcher {
  const dispatcher: Dispatcher = {
    listeners,
    registrations: new Set(),
    dispatch: (data) => {
      if (!dispatcher.registrations.size) return;

      if (!intact(dispatcher)) {
        fail(dispatcher);

        return;
      }

      for (const registration of dispatcher.registrations) {
        registration.reconcile();
        if (!isKeyRelease(data) && registration.route(data)) return { consume: true };
      }

      return;
    }
  };
  // Only called from a microtask. Re-adding entries during Set traversal revisits them.
  const previous = [...listeners];
  listeners.clear();
  listeners.add(dispatcher.dispatch);
  for (const listener of previous) listeners.add(listener);
  dispatchers.set(listeners, dispatcher);
  ownedDispatchers.add(dispatcher.dispatch);

  return dispatcher;
}

/** One registration per host presentation, never per retained logical component. */
export function fullscreenInputRouting(options: {
  tui: TUI;
  presentation: Component & Focusable;
  eligible(): boolean;
  owns(data: string): boolean;
  onUnavailable(): void;
}) {
  let disposed = false;
  let failed = false;
  let queued = false;
  let dispatcher: Dispatcher | undefined;

  const detach = () => {
    if (!dispatcher) return;
    dispatcher.registrations.delete(registration);

    if (!dispatcher.registrations.size) {
      dispatcher.listeners.delete(dispatcher.dispatch);
      dispatchers.delete(dispatcher.listeners);
    }

    dispatcher = undefined;
  };

  const unavailable = () => {
    if (disposed || failed) return;
    failed = true;
    detach();
    options.onUnavailable();
  };

  const inspect = () => capability(options.tui);

  const active = () =>
    !disposed && !failed && options.eligible() && options.tui.mode === "fullscreen";

  const reconcile = () => {
    if (!active()) {
      detach();

      return;
    }

    const host = inspect();

    if (!host) {
      unavailable();

      return;
    }

    if (dispatcher && !intact(dispatcher)) {
      fail(dispatcher);

      return;
    }

    if (dispatcher?.listeners === host.listeners) return;
    detach();
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!active()) return;
      // A renderer can change between layout/focus notification and installation.
      const current = inspect();

      if (!current) {
        unavailable();

        return;
      }

      if (current.listeners !== host.listeners) {
        reconcile();

        return;
      }

      const existing = dispatchers.get(current.listeners);

      if (existing && !intact(existing)) {
        fail(existing);
        unavailable();

        return;
      }

      // A copied collection containing one of our callbacks is not a fresh renderer.
      if (!existing && [...current.listeners].some((listener) => ownedDispatchers.has(listener))) {
        unavailable();

        return;
      }

      dispatcher = existing ?? install(current.listeners);
      dispatcher.registrations.add(registration);
    });
  };

  const registration: Registration = {
    reconcile,
    unavailable,
    route: (data) => {
      if (!active() || !dispatcher || !options.presentation.focused) return false;
      const host = inspect();
      if (host?.listeners !== dispatcher.listeners || host.focus !== options.presentation)
        return false;
      if (!options.presentation.handleInput || !options.owns(data)) return false;
      options.presentation.handleInput(data);
      options.tui.requestRender();

      return true;
    }
  };

  return {
    reconcile,
    dispose: () => {
      disposed = true;
      detach();
    }
  };
}
