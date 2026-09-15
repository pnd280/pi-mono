import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { assertRestorable } from "../host/editor.ts";
import type { PromptManager, ViewRequest } from "../manager.ts";
import { errorMessage, PromptError, type Occurrence } from "../model.ts";
import { BrowserController } from "./controller.ts";
import { usableCancelKeys } from "./controls.ts";
import { browserLayout } from "./layout.ts";
import { BrowserView } from "./view.ts";

type RestorationRequest = { target: Occurrence; remove: boolean };

export async function openBrowser(
  ctx: ExtensionContext,
  manager: PromptManager,
  request: ViewRequest
): Promise<void> {
  if (request.signal.aborted || !manager.active) return;
  let requestRender: (() => void) | undefined;

  let finishPresentation = () => {};

  let restoration: RestorationRequest | undefined;
  let view: BrowserView | undefined;

  const requestRestoration = (next: RestorationRequest) => {
    try {
      assertRestorable(next.target.source.text);
      restoration = next;

      return true;
    } catch (error) {
      manager.notify(errorMessage(error), "error");

      return false;
    }
  };

  const controller = new BrowserController(
    {
      read: (collection) => manager.ports.repository.read(collection),
      copy: (target) => manager.copy(target),
      restore: (target) => requestRestoration({ target, remove: false }),
      restoreAndRemove: async (target) => {
        if (!requestRestoration({ target, remove: true })) return false;
        controller.close();

        return true;
      },
      remove: (collection, target) => manager.remove(collection, target),
      changed: () => requestRender?.(),
      close: () => finishPresentation(),
      now: Date.now
    },
    {
      collection: request.collection,
      initialEditor: request.initialEditor,
      ...(request.inspectionIndex === undefined ? {} : { inspectionIndex: request.inspectionIndex })
    }
  );
  const abort = () => controller.close();
  request.signal.addEventListener("abort", abort, { once: true });

  // The first factory supplies Pi's terminal dimensions. If space is short, finish that
  // inline call before mounting it and reopen as an overlay. No stdout-size guess is needed.
  let overlay = false;
  const active = () => !controller.closed && manager.active && !request.signal.aborted;

  try {
    while (active()) {
      const presentation: { remount: boolean; nextOverlay: boolean } = {
        remount: false,
        nextOverlay: overlay
      };
      let mounted = !overlay;
      let pendingClose = false;
      let settled = false;
      await ctx.ui.custom<void>(
        (tui, theme, keys, done) => {
          const finish = () => {
            pendingClose = true;
            // Closing an unmounted overlay would pop an unrelated overlay in Pi.
            if (!mounted || settled) return;
            settled = true;
            done();
          };

          finishPresentation = finish;

          requestRender = () => {
            if (manager.active) tui.requestRender();
          };

          if (!usableCancelKeys(keys).length)
            throw new PromptError(
              "Prompt browser requires an unshadowed cancel binding other than Ctrl+C. Fix tui.select.cancel / tui.input.copy and reload."
            );

          if (!view) {
            view = new BrowserView(controller, tui, theme, keys);
            void controller.activate();
          }

          const currentView = view;

          const checkLayout = () => {
            presentation.nextOverlay = browserLayout(tui.terminal.rows).overlay;
            if (presentation.nextOverlay === overlay) return;
            presentation.remount = true;
            controller.cancelConfirmation();
            // Never change Pi's component tree during its render traversal.
            queueMicrotask(finish);
          };

          checkLayout();
          if (request.signal.aborted || !manager.active || controller.closed)
            queueMicrotask(() => {
              controller.close();
              finish();
            });

          // Only these host adapters are disposed on a resize. The logical view stays alive
          // until final closure, retaining its Input cursor and prepared preview as well as state.
          return {
            render: (width) => {
              if (settled || controller.closed) return [];
              checkLayout();

              return presentation.remount ? [] : currentView.render(width);
            },
            handleInput: (data) => {
              if (!settled && !presentation.remount) currentView.handleInput(data);
            },
            invalidate: () => {
              if (!settled) currentView.invalidate();
            },
            get focused() {
              return !settled && currentView.focused;
            },
            set focused(value: boolean) {
              if (!settled) currentView.focused = value;
            },
            dispose: () => {
              if (!settled) controller.close();
            }
          };
        },
        {
          overlay,
          overlayOptions: { width: "100%", maxHeight: "75%", anchor: "center" },
          onHandle: () => {
            mounted = true;
            if (pendingClose) finishPresentation();
          }
        }
      );
      if (!presentation.remount) break;
      overlay = presentation.nextOverlay;
    }
  } finally {
    request.signal.removeEventListener("abort", abort);
    controller.close();
  }

  // Inline custom UI restores Pi's opening editor snapshot on close. Apply replacement
  // only after the final presentation closes, never during an inline/overlay transition.
  if (restoration) {
    const operation = restoration.remove
      ? manager.restoreAndRemove(restoration.target)
      : manager.restore(restoration.target);
    requestRender?.(); // setEditorText itself does not request a redraw.
    await operation;
  }
}
