import type { ToolDisplayAdapter } from "./adapters/types.ts";
import {
  createToolDisplayRenderers as createCardRenderers,
  type ToolDisplayRendererOptions as CardRendererOptions,
  type ToolDisplayRenderers
} from "./renderers.ts";

export type { ToolFamily } from "./display-model.ts";
export type { ToolDisplayRenderers } from "./renderers.ts";

/** Public owner integration exposes parameter policy, not private transcript state. */
export type ToolDisplayRendererOptions = Pick<CardRendererOptions, "showParameters">;

export function createToolDisplayRenderers(
  name: string,
  adapter?: ToolDisplayAdapter,
  options: ToolDisplayRendererOptions = {}
): ToolDisplayRenderers {
  return createCardRenderers(name, adapter, {
    showParameters: options.showParameters === true
  });
}
