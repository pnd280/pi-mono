import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Markdown,
  MouseRegion,
  sliceByColumn,
  Spacer,
  truncateToWidth,
  type Component
} from "@earendil-works/pi-tui";
import { inspectedSource, OwnedHooks } from "@pi-mono/libs/owned-hooks";
import { TUI_GLYPHS } from "@pi-mono/libs/tui/glyphs";

import { record } from "../values.ts";

// Pi 1.5.2 updateContent creates direct Markdown children only for prose, with outputPad on both sides, and one MouseRegion per shown nonempty thinking run. It reuses Markdown instances across updates, so decoration wraps without mutating them. Gate this private layout for the API and installed CLI, and keep .agents/skills/pi-update/scripts/fingerprints.ts in sync.
const updateHashes = new Set([
  "459e35194d5d6a0c57f2014f286adf578e3c846b63472bf3b2f394c89d8817fb",
  "1360563a5ebd3ce35aa4c13b83ede21eb80b8ce0bde448e31e22c55824223a2c"
]);

const presented = new WeakMap<AssistantMessageComponent, Set<number>>();

/** Record the authoritative block end before Pi rebuilds the streaming row. Shared partials may already contain later blocks, so content alone cannot distinguish completed thinking from a still-active consecutive thinking run. */
export function trackThinkingCompletion(
  component: AssistantMessageComponent | undefined,
  event: AssistantMessageEvent
): void {
  if (component && event.type === "thinking_end") presented.get(component)?.add(event.contentIndex);
}

/** Visible thinking separates exploration groups, not the logical tool run. Unknown assistant layouts retain their original visible-boundary behavior. */
export function assistantBoundaryKind(
  component: AssistantMessageComponent
): "group" | "run" | undefined {
  const content = component.children.flatMap((child) =>
    child instanceof Container ? child.children : []
  );
  if (!content.length) return;
  if (!presented.has(component)) return "run";

  // In the verified layout only thinking uses MouseRegion. Prose (including decorated Markdown) and terminal diagnostics are direct non-spacer children.
  return content.some((child) => !(child instanceof Spacer) && !(child instanceof MouseRegion))
    ? "run"
    : "group";
}

function suppressCompletedThinking(component: AssistantMessageComponent): void {
  const state = record(component);
  if (typeof state.isStreaming !== "boolean" || typeof state.hideThinkingBlock !== "boolean")
    return;
  const container = state.contentContainer;
  const overrides = state.thinkingVisibilityOverrides;
  const content = record(state.lastMessage).content;
  if (!(container instanceof Container) || !(overrides instanceof Map) || !Array.isArray(content))
    return;
  const ended = presented.get(component);
  const hidden: boolean[] = [];
  let nonempty = false;
  let complete = true;

  for (let index = 0; index <= content.length; index++) {
    const block = record(content[index]);

    if (block.type === "thinking") {
      nonempty ||= typeof block.thinking === "string" && !!block.thinking.trim();
      complete &&= !state.isStreaming || ended?.has(index) === true;
      continue;
    }

    if (nonempty) {
      const override: unknown = overrides.get(hidden.length);
      hidden.push(complete && (typeof override === "boolean" ? override : state.hideThinkingBlock));
    }

    nonempty = false;
    complete = true;
  }

  removeThinkingRows(container, hidden);
}

function removeThinkingRows(container: Container, hidden: readonly boolean[]): void {
  // With an empty hidden-thinking label, Pi omits every hidden run itself. The counts then differ, and no row that this would remove is left.
  const regions = container.children.filter((child) => child instanceof MouseRegion);
  if (regions.length !== hidden.length || !hidden.some(Boolean)) return;
  const suppressed = new Set(regions.filter((_region, index) => hidden[index]));
  const children: Component[] = [];

  for (const child of container.children) {
    if (child instanceof MouseRegion && suppressed.has(child)) continue;
    if (child instanceof Spacer && children.at(-1) instanceof Spacer) continue;
    children.push(child);
  }

  while (children.at(-1) instanceof Spacer) children.pop();
  container.children = children;
}

/** Keep Pi's Markdown instance so transformers, highlighting, and theme updates still run natively. Replace its outer padding with a marker and hanging indent. */
function markProse(component: AssistantMessageComponent): void {
  const state = record(component);
  const container = state.contentContainer;
  const padding = state.outputPad;
  if (!(container instanceof Container) || typeof padding !== "number") return;

  container.children = container.children.map((child): Component => {
    // Thinking Markdown is nested in a MouseRegion; diagnostics are Text.
    if (!(child instanceof Markdown)) return child;

    let cached: { width: number; source: string[]; rows: string[] } | undefined;

    return {
      invalidate() {
        cached = undefined;
        child.invalidate();
      },
      render(width) {
        const contentWidth = Math.max(1, width - 2);
        const source = child.render(contentWidth + padding * 2);
        if (cached?.width === width && cached.source === source) return cached.rows;

        const rows = source.map((row, index) => {
          const prefix = index === 0 ? `${TUI_GLYPHS.bullet} ` : "  ";

          return truncateToWidth(
            `${prefix}${sliceByColumn(row, padding, contentWidth)}`,
            width,
            ""
          );
        });
        cached = { width, source, rows };

        return rows;
      }
    };
  });
}

/** Preserve Pi's messages, Markdown, and toggle/click callbacks. Decorate prose and remove completed hidden thinking rows only after Pi builds its content. A failed installation restores Pi's presentation before it throws. */
export function bindAssistantPresentation(
  component: AssistantMessageComponent,
  changed: () => void
): (() => void) | undefined {
  // oxlint-disable-next-line typescript/unbound-method
  const previous = component.updateContent;
  if (!inspectedSource(previous, updateHashes)) return undefined;
  const hooks = new OwnedHooks();
  let active = true;
  presented.set(component, new Set());

  const update: typeof previous = function (this: AssistantMessageComponent, message, streaming) {
    previous.call(this, message, streaming);
    if (!active) return;
    suppressCompletedThinking(this);
    markProse(this);
    changed();
  };

  const release = () => {
    active = false;
    presented.delete(component);
    hooks.restore();
    component.invalidate();
  };

  try {
    hooks.replace(component, "updateContent", update);
    suppressCompletedThinking(component);
    markProse(component);
  } catch (error) {
    release();
    throw error;
  }

  return release;
}
