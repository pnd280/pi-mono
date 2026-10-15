import {
  CustomMessageComponent,
  type ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";
import { Image, visibleWidth, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { OwnedHooks } from "@pi-mono/libs/owned-hooks";

import type { DisplayAction, DisplayCall } from "../contracts.ts";
import { modifierHeld } from "../rendering/mouse.ts";
import { layoutRow, rowChrome, type RowLayout } from "../rendering/row-layout.ts";
import { renderRunSummary } from "../rendering/summary-line.ts";
import type { DisplayTheme } from "../rendering/types.ts";
import type { TranscriptCoordinator } from "../transcript/coordinator.ts";
import { record } from "../values.ts";

type DisplayRow = ToolExecutionComponent | CustomMessageComponent;

/** A click the row itself consumed, targeted at the row. */
function handled(component: DisplayRow, event: TuiMouseEvent) {
  return {
    handled: true as const,
    target: {
      component,
      originX: event.screenX - event.x,
      originY: event.screenY - event.y,
      width: event.width,
      height: event.height
    }
  };
}

/**
 * Own a Pi row's chrome and click routing: summary lines, hidden members, joined
 * group margins, and collapse controls. Card clicks the transcript does not handle
 * reach Pi's own row handlers at their original coordinates.
 */
export function bindRowChrome(
  row: DisplayRow,
  call: DisplayCall,
  coordinator: TranscriptCoordinator,
  options: {
    active: () => boolean;
    theme: () => DisplayTheme | undefined;
    /** Only the last notice after a call (or the call without notices) owns its footer. */
    tail?: () => boolean;
    action?: ((action: DisplayAction) => void) | undefined;
  }
): () => void {
  const hooks = new OwnedHooks();
  const notice = row instanceof CustomMessageComponent;
  // Retain Pi's unbound methods and rebind their original receiver when delegating.
  // oxlint-disable-next-line typescript/unbound-method
  const previousRender = row.render;
  // oxlint-disable-next-line typescript/unbound-method
  const previousMouse = row.handleMouse;
  // oxlint-disable-next-line typescript/unbound-method
  const previousInvalidate = row.invalidate;
  let targets: RowLayout["targets"] = [];
  let summary: { revision: number; width: number; line: string[] } | undefined;

  // The coordinator invalidates a leader when its run changes; Pi invalidates rows
  // on theme changes.
  const summaryLine = (width: number, theme: DisplayTheme | undefined) => {
    if (!theme) return [];

    if (summary?.revision !== call.revision || summary.width !== width) {
      const model = coordinator.summary(call);
      summary = {
        revision: call.revision,
        width,
        line: renderRunSummary(model, { width, theme })
      };
    }

    return summary.line;
  };

  const render: typeof row.render = function (this: DisplayRow, width) {
    if (!options.active() || width < 1) {
      targets = [];

      return previousRender.call(this, width);
    }

    const theme = options.theme();
    const chrome = rowChrome(
      call,
      coordinator,
      width,
      theme,
      () => summaryLine(width, theme),
      notice,
      options.tail?.() ?? true
    );
    // Summary chrome replaces the entire row. Do not prepare hidden cards or images.
    // For visible cards, Pi updates selfRenderHeight while rendering.
    const imageHooks = new OwnedHooks();

    if (chrome.kind === "card") {
      const indent = visibleWidth(chrome.imagePrefix);

      // Pi renders these same public Image children after its card. Constrain only
      // their width, keeping Pi's image IDs, conversion, caching, and reserved rows.
      for (const child of this.children) {
        if (!(child instanceof Image)) continue;
        // oxlint-disable-next-line typescript/unbound-method
        const previousImageRender = child.render;
        imageHooks.replace(child, "render", function (this: Image, imageWidth) {
          return previousImageRender.call(this, Math.max(1, imageWidth - indent));
        });
      }
    }

    try {
      const rows = chrome.kind === "card" ? previousRender.call(this, width) : [];
      // CustomMessageComponent is a one-row Spacer followed by our notice renderer.
      const height = notice ? Math.max(0, rows.length - 1) : record(this).selfRenderHeight;
      const layout = layoutRow(rows, typeof height === "number" ? height : 0, chrome);
      targets = layout.targets;

      return layout.rows;
    } finally {
      imageHooks.restore();
    }
  };

  const handleMouse: typeof row.handleMouse = function (this: DisplayRow, event) {
    if (!options.active()) return previousMouse.call(this, event);
    const target = targets[event.y];
    if (!target) return undefined;
    // Pi's own regions would still expand the card, so a modified click stops here.
    if (event.type === "click" && modifierHeld(event)) return undefined;
    const click = event.type === "click" && event.button === "left";

    if (target.kind === "collapse")
      return click && coordinator.activate(call, "collapse") ? handled(this, event) : undefined;
    if (click && coordinator.activate(call, notice ? "notice" : "card"))
      return handled(this, event);

    const action = !notice && click ? coordinator.interpretation(call).action : undefined;

    if (action && options.action) {
      options.action(action);

      return handled(this, event);
    }

    // Pi subtracts its margin row before routing to the renderer slots.
    const local: TuiMouseEvent = { ...event, y: target.y + 1 };

    return previousMouse.call(this, local);
  };

  const invalidate: typeof row.invalidate = function (this: DisplayRow) {
    summary = undefined;
    previousInvalidate.call(this);
  };

  // Owned hooks unwind in reverse order: restore rendering before mouse routing.
  hooks.replace(row, "invalidate", invalidate);
  hooks.replace(row, "handleMouse", handleMouse);
  hooks.replace(row, "render", render);

  return () => {
    targets = [];
    summary = undefined;
    hooks.restore();
  };
}
