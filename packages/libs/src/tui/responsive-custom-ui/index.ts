import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, OverlayOptions } from "@earendil-works/pi-tui";

import { fullscreenInputRouting } from "./fullscreen-input.ts";

type HostArguments = Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>;

type LogicalComponent = Component &
  Partial<Focusable> & { dispose?(): void; ownsFullscreenInput?(data: string): boolean };

type Create<ComponentType> = (
  tui: HostArguments[0],
  theme: HostArguments[1],
  keys: HostArguments[2],
  close: () => void
) => ComponentType;

export type ResponsiveCustomUIOptions = {
  ui: Pick<ExtensionContext["ui"], "custom">;
  signal: AbortSignal;
  useOverlay(tui: HostArguments[0]): boolean;
  overlayOptions?: OverlayOptions;
  onTransition?(): void;
} & (
  | {
      create: Create<LogicalComponent>;
      onInputRoutingUnavailable(): void;
    }
  | {
      create: Create<LogicalComponent & { ownsFullscreenInput?: never }>;
      onInputRoutingUnavailable?: never;
    }
);

/** Preserve one logical component while replacing only Pi's inline/overlay host adapters. */
export async function openResponsiveCustomUI(options: ResponsiveCustomUIOptions): Promise<void> {
  if (options.signal.aborted) return;
  let closed = false;

  let finishPresentation = () => {};

  let deactivatePresentation = () => {};

  let reportedUnavailable = false;

  let view: LogicalComponent | undefined;

  const close = () => {
    closed = true;
    deactivatePresentation();
    finishPresentation();
  };

  const active = () => !closed;
  options.signal.addEventListener("abort", close, { once: true });
  // The first factory supplies actual terminal dimensions; never guess from process.stdout.
  let overlay = false;

  try {
    while (active()) {
      const presentation: { remount: boolean; nextOverlay: boolean } = {
        remount: false,
        nextOverlay: overlay
      };
      let mounted = !overlay;
      let pendingClose = false;
      let settled = false;
      let focused = false;
      let routing: ReturnType<typeof fullscreenInputRouting> | undefined;

      let finishMounted = () => {};

      await options.ui.custom<void>(
        (tui, theme, keys, done) => {
          const finish = () => {
            routing?.dispose();
            pendingClose = true;
            // Pi would pop an unrelated overlay if done() ran before mounting ours.
            if (!mounted || settled) return;
            settled = true;
            done();
          };

          finishPresentation = finish;
          finishMounted = finish;
          view ??= options.create(tui, theme, keys, close);
          const currentView = view;
          if (currentView.ownsFullscreenInput && !options.onInputRoutingUnavailable)
            throw new Error("Fullscreen input ownership requires onInputRoutingUnavailable.");

          const checkLayout = () => {
            presentation.nextOverlay = options.useOverlay(tui);

            if (presentation.nextOverlay === overlay) {
              routing?.reconcile();

              return;
            }

            presentation.remount = true;
            routing?.dispose();
            options.onTransition?.();
            // Never mutate Pi's component tree during its render traversal.
            queueMicrotask(finish);
          };

          checkLayout();
          if (closed || options.signal.aborted) queueMicrotask(close);

          const adapter: Component & Focusable & { dispose(): void } = {
            render: (width) => {
              if (settled || closed) return [];
              checkLayout();

              return presentation.remount ? [] : currentView.render(width);
            },
            handleInput: (data) => {
              if (!settled && !closed && !presentation.remount) currentView.handleInput?.(data);
            },
            invalidate: () => {
              if (!settled && !closed) currentView.invalidate();
            },
            get focused() {
              return !settled && !closed && focused;
            },
            set focused(value: boolean) {
              focused = value;
              if (!settled && !closed && "focused" in currentView) currentView.focused = value;
              routing?.reconcile();
            },
            dispose: () => {
              routing?.dispose();
              if (!settled) close();
            }
          };

          if (currentView.ownsFullscreenInput && currentView.handleInput) {
            routing = fullscreenInputRouting({
              tui,
              presentation: adapter,
              eligible: () => mounted && !overlay && !settled && !closed && !presentation.remount,
              owns: (data) => currentView.ownsFullscreenInput?.(data) ?? false,
              onUnavailable: () => {
                if (reportedUnavailable) return;
                reportedUnavailable = true;
                options.onInputRoutingUnavailable?.();
              }
            });
          }

          deactivatePresentation = () => routing?.dispose();

          return adapter;
        },
        {
          overlay,
          ...(options.overlayOptions === undefined
            ? {}
            : { overlayOptions: options.overlayOptions }),
          onHandle: () => {
            mounted = true;
            // Retained handles from an older presentation cannot finish its replacement.
            if (pendingClose) finishMounted();
            else routing?.reconcile();
          }
        }
      );
      routing?.dispose();
      if (!presentation.remount) break;
      overlay = presentation.nextOverlay;
    }
  } finally {
    closed = true;
    deactivatePresentation();
    options.signal.removeEventListener("abort", close);
    view?.dispose?.();
  }
}
