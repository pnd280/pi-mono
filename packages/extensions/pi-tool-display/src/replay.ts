import {
  InteractiveMode,
  type AgentSession,
  type ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";

import { toolFamily } from "./presentation.ts";
import { createToolDisplayRenderers } from "./renderers.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];
type LookupHost = { session: Pick<AgentSession, "getAllTools"> };
type DefinitionLookup = (this: LookupHost, name: string) => RenderDefinition;

// Survives module reloads so repeated factories replace our hook rather than nesting it.
const replayHook = Symbol.for("pi-tool-display.replayHook");
interface LookupPrototype {
  getRegisteredToolDefinition?: DefinitionLookup;
  [replayHook]?: () => void;
}

/** Pi 0.85.1 restores transcript rows before session_start can register our displays. */
export function installReplayDisplays(): (() => void) | undefined {
  // This is the only private Pi boundary: the TUI's render-only definition lookup.
  const prototype = InteractiveMode.prototype as unknown as LookupPrototype;
  prototype[replayHook]?.();
  const original = prototype.getRegisteredToolDefinition;
  if (typeof original !== "function") return undefined;

  let active = true;
  const lookup: DefinitionLookup = function (name) {
    const definition = original.call(this, name);
    if (!active || definition === undefined || toolFamily(name) === "invocation") return definition;
    const source = this.session.getAllTools().find((tool) => tool.name === name)?.sourceInfo.source;
    // Ownership comes from the fresh host session, never a captured pre-reload ExtensionAPI.
    if (source !== "builtin") return definition;
    return { ...definition, ...createToolDisplayRenderers(name) };
  };

  const dispose = (): void => {
    active = false;
    // Do not remove another extension's later wrapper. Our retained wrapper becomes inert.
    if (prototype.getRegisteredToolDefinition === lookup) {
      prototype.getRegisteredToolDefinition = original;
    }
    if (prototype[replayHook] === dispose) delete prototype[replayHook];
  };

  prototype.getRegisteredToolDefinition = lookup;
  prototype[replayHook] = dispose;
  return dispose;
}
