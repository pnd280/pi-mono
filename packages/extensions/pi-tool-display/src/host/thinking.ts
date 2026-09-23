import { createHash } from "node:crypto";

import type { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import { Container, MouseRegion, Spacer, type Component } from "@earendil-works/pi-tui";

import { record } from "../values.ts";

// Pi 0.87.1 updateContent creates one MouseRegion per nonempty consecutive thinking
// run. Gate this private child-layout contract for both the API and installed CLI.
const updateHashes = new Set([
  "fd0c8ba64d8a398fce1ff73d93e43bc70b66ba50e06491ddeb4826c37992a302",
  "21231e9a625e9f97c43361e980af32dce7f77573e4edef89367971a0a521e269"
]);

function suppressCompletedThinking(component: AssistantMessageComponent): void {
  const state = record(component);
  if (state.isStreaming !== false || typeof state.hideThinkingBlock !== "boolean") return;
  const container = state.contentContainer;
  const overrides = state.thinkingVisibilityOverrides;
  const content = record(state.lastMessage).content;
  if (!(container instanceof Container) || !(overrides instanceof Map) || !Array.isArray(content))
    return;
  const hidden: boolean[] = [];
  let nonempty = false;

  for (let index = 0; index <= content.length; index++) {
    const block = record(content[index]);

    if (block.type === "thinking") {
      nonempty ||= typeof block.thinking === "string" && !!block.thinking.trim();
      continue;
    }

    if (nonempty) {
      const override: unknown = overrides.get(hidden.length);
      hidden.push(typeof override === "boolean" ? override : state.hideThinkingBlock);
    }

    nonempty = false;
  }

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

/** Preserve Pi's messages and toggle/click callbacks; only remove completed hidden
 * thinking rows after Pi builds them. Other assistant content and diagnostics stay native.
 */
export function bindThinkingVisibility(
  component: AssistantMessageComponent,
  changed: () => void
): (() => void) | undefined {
  // oxlint-disable-next-line typescript/unbound-method
  const previous = component.updateContent;
  if (!updateHashes.has(createHash("sha256").update(previous.toString()).digest("hex")))
    return undefined;
  let active = true;

  const update: typeof previous = function (this: AssistantMessageComponent, message, streaming) {
    previous.call(this, message, streaming);
    if (!active) return;
    suppressCompletedThinking(this);
    changed();
  };

  component.updateContent = update;
  suppressCompletedThinking(component);

  return () => {
    active = false;
    if (component.updateContent === update) component.updateContent = previous;
    component.invalidate();
  };
}
