import {
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createPowerShellToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type ExtensionAPI,
  type SettingsManager,
  type ToolDefinition
} from "@earendil-works/pi-coding-agent";

import { createToolDisplayRenderers } from "./renderers.ts";

type ToolRegistry = Pick<
  ExtensionAPI,
  "getAllTools" | "getActiveTools" | "registerTool" | "setActiveTools"
>;
type ExecutionSettings = Pick<
  SettingsManager,
  "getShellPath" | "getShellCommandPrefix" | "getImageAutoResize"
>;

/**
 * Standard CLI only: ExtensionAPI does not expose execution definitions or in-memory settings.
 * Pi also labels SDK base-tool overrides as "builtin", so the metadata guard below cannot
 * distinguish those from local tools. SDK hosts must decorate their own definitions instead.
 */
export function registerBuiltinDisplays(
  pi: ToolRegistry,
  cwd: string,
  settings: ExecutionSettings
): void {
  const builtinNames = new Set(
    pi
      .getAllTools()
      .filter((tool) => tool.sourceInfo.source === "builtin")
      .map((tool) => tool.name)
  );
  const active = pi.getActiveTools();

  function register<TParams extends ToolDefinition["parameters"], TDetails>(
    definition: ToolDefinition<TParams, TDetails>
  ): void {
    if (builtinNames.has(definition.name)) {
      pi.registerTool({ ...definition, ...createToolDisplayRenderers(definition.name) });
    }
  }

  const shellPath = settings.getShellPath();
  const commandPrefix = settings.getShellCommandPrefix();
  register(createReadToolDefinition(cwd, { autoResizeImages: settings.getImageAutoResize() }));
  register(
    createBashToolDefinition(cwd, {
      ...(shellPath === undefined ? {} : { shellPath }),
      ...(commandPrefix === undefined ? {} : { commandPrefix })
    })
  );
  register(createPowerShellToolDefinition(cwd));
  register(createEditToolDefinition(cwd));
  register(createWriteToolDefinition(cwd));
  register(createGrepToolDefinition(cwd));
  register(createFindToolDefinition(cwd));
  register(createLsToolDefinition(cwd));
  // Registering an inactive built-in must not enable it or weaken a CLI tool allowlist.
  pi.setActiveTools(active);
}
