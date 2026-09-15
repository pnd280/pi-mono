import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, OverlayOptions } from "@earendil-works/pi-tui";

type HostArguments = Parameters<Parameters<ExtensionContext["ui"]["custom"]>[0]>;

type LogicalComponent = Component & Partial<Focusable> & { dispose?(): void };

export type ResponsiveCustomUIOptions = {
  ui: Pick<ExtensionContext["ui"], "custom">;
  signal: AbortSignal;
  create(
    tui: HostArguments[0],
    theme: HostArguments[1],
    keys: HostArguments[2],
    close: () => void
  ): LogicalComponent;
  useOverlay(tui: HostArguments[0]): boolean;
  overlayOptions?: OverlayOptions;
  onTransition?(): void;
};

/** Preserve one logical component while replacing only Pi's inline/overlay host adapters. */
export async function openResponsiveCustomUI(options: ResponsiveCustomUIOptions): Promise<void> {
  if (options.signal.aborted) return;
  let closed = false;

  let finishPresentation = () => {};

  let view: LogicalComponent | undefined;

  const close = () => {
    closed = true;
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

      let finishMounted = () => {};

      await options.ui.custom<void>(
        (tui, theme, keys, done) => {
          const finish = () => {
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

          const checkLayout = () => {
            presentation.nextOverlay = options.useOverlay(tui);
            if (presentation.nextOverlay === overlay) return;
            presentation.remount = true;
            options.onTransition?.();
            // Never mutate Pi's component tree during its render traversal.
            queueMicrotask(finish);
          };

          checkLayout();
          if (closed || options.signal.aborted) queueMicrotask(close);

          return {
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
              return !settled && !closed && (currentView.focused ?? false);
            },
            set focused(value: boolean) {
              if (!settled && !closed && "focused" in currentView) currentView.focused = value;
            },
            dispose: () => {
              if (!settled) close();
            }
          };
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
          }
        }
      );
      if (!presentation.remount) break;
      overlay = presentation.nextOverlay;
    }
  } finally {
    closed = true;
    options.signal.removeEventListener("abort", close);
    view?.dispose?.();
  }
}
