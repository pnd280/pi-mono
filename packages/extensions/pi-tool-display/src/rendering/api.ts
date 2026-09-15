import type { ToolDisplayAdapter } from "../contracts.ts";
import { createToolDisplayRenderers as createCardRenderers } from "./cards.ts";
import type { ToolDisplayRendererOptions, ToolDisplayRenderers } from "./types.ts";

export type { ToolFamily } from "../contracts.ts";

export type { ToolDisplayRendererOptions, ToolDisplayRenderers } from "./types.ts";

/**
 * Create renderer fields for a tool definition. Without an adapter, all names use
 * generic rendering. Explicit adapters assert compatibility with retained data.
 * This factory does not read CLI settings, observe execution, or load output files.
 */
export function createToolDisplayRenderers(
  name: string,
  adapter?: ToolDisplayAdapter,
  options: ToolDisplayRendererOptions = {}
): ToolDisplayRenderers {
  return createCardRenderers(name, adapter, {
    showParameters: options.showParameters === true
  });
}
