import type { ToolDefinition, ToolInfo } from "@earendil-works/pi-coding-agent";

import { piFffAdapter } from "../adapters/@ff-labs/pi-fff/index.ts";
import { genericAdapter } from "../adapters/generic.ts";
import { nativeAdapter } from "../adapters/native/index.ts";
import { piMcpAdapter } from "../adapters/pi-mcp-adapter/index.ts";
import { piSelectiveReadAdapter } from "../adapters/pi-selective-read/index.ts";
import { piSmartCompactAdapter } from "../adapters/pi-smart-compact/index.ts";
import { piTodoAdapter } from "../adapters/pi-todo/index.ts";
import type { ToolDisplayAdapter, ToolDisplayAdapterResolver } from "../contracts.ts";
import type { DisplaySettings } from "../settings.ts";

// First matching contract wins. Each entry explicitly opts its verified owner into
// this display, even when that owner supplies renderer slots. Keep native ownership
// separate: only the host can establish the factory provenance required for it.
const extensionAdapterResolvers: readonly ToolDisplayAdapterResolver[] = [
  piFffAdapter,
  piMcpAdapter,
  piTodoAdapter,
  piSelectiveReadAdapter,
  piSmartCompactAdapter
];

export function selectAdapter(
  settings: DisplaySettings,
  name: string,
  original: Pick<ToolDefinition, "renderCall" | "renderResult"> | undefined,
  native: boolean,
  info?: ToolInfo
): ToolDisplayAdapter | undefined {
  const mode = settings.valid ? (settings.rendererOverrides[name] ?? "auto") : "original";
  if (mode === "original") return undefined;
  if (mode === "generic") return genericAdapter;
  if (native) return nativeAdapter(name) ?? genericAdapter;

  for (const resolve of extensionAdapterResolvers) {
    const adapter = resolve(info);
    if (adapter) return adapter;
  }

  return original?.renderCall || original?.renderResult ? undefined : genericAdapter;
}
