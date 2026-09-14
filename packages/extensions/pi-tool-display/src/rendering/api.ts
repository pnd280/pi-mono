import type { ToolDisplayAdapter } from "../contracts.ts";
import { createToolDisplayRenderers as createCardRenderers } from "./cards.ts";
import type { ToolDisplayRendererOptions, ToolDisplayRenderers } from "./types.ts";

export type { ToolFamily } from "../contracts.ts";

/** Public owner integration exposes parameter policy, not private transcript state. */
export type { ToolDisplayRendererOptions, ToolDisplayRenderers } from "./types.ts";

export function createToolDisplayRenderers(
  name: string,
  adapter?: ToolDisplayAdapter,
  options: ToolDisplayRendererOptions = {}
): ToolDisplayRenderers {
  return createCardRenderers(name, adapter, {
    showParameters: options.showParameters === true
  });
}
