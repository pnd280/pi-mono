import {
  InteractiveMode,
  type AgentSession,
  type ToolExecutionComponent
} from "@earendil-works/pi-coding-agent";

import { toolFamily } from "./presentation.ts";
import { createToolDisplayRenderers } from "./renderers.ts";

type RenderDefinition = ConstructorParameters<typeof ToolExecutionComponent>[4];
type LookupHost = { session: Pick<AgentSession, "getAllTools"> };
type DefinitionLookup = (this: LookupHost, name: string) => RenderDefinition;

// Survives module reloads so repeated factories replace our hook rather than nesting it.
const displayHook = Symbol.for("pi-tool-display.builtinDisplayHook");
interface LookupPrototype {
  getRegisteredToolDefinition?: DefinitionLookup;
  [displayHook]?: () => void;
}

/** Install before Pi 0.85.1 reconstructs history, which precedes session_start. */
export function installBuiltinDisplays(): (() => void) | undefined {
  // The sole private Pi boundary: this render-only lookup serves live and restored rows.
  const prototype = InteractiveMode.prototype as unknown as LookupPrototype;
  let dispose: (() => void) | undefined;
  try {
    prototype[displayHook]?.();
    const previous = prototype.getRegisteredToolDefinition;
    if (typeof previous !== "function") return undefined;

    let active = true;
    const lookup: DefinitionLookup = function (name) {
      // A previous lookup failure is not ours to recover from. Call it exactly once.
      const definition = previous.call(this, name);
      if (!active || definition === undefined) return definition;
      try {
        if (toolFamily(name) === "invocation") return definition;
        const source = this.session.getAllTools().find((tool) => tool.name === name)
          ?.sourceInfo.source;
        // Consult the current session, never a captured pre-reload ExtensionAPI. This guard
        // is CLI-only: SDK base-tool overrides also have a "builtin" label, which cannot
        // establish native ownership. SDK hosts must opt in through the renderer factory.
        if (source !== "builtin") return definition;
        return { ...definition, ...createToolDisplayRenderers(name) };
      } catch {
        // Keep an available host view if our ownership check or decoration fails.
        return definition;
      }
    };

    dispose = (): void => {
      active = false;
      try {
        // A later wrapper must remain installed; our retained wrapper becomes inert.
        if (prototype.getRegisteredToolDefinition === lookup) {
          prototype.getRegisteredToolDefinition = previous;
        }
        if (prototype[displayHook] === dispose) delete prototype[displayHook];
      } catch {
        // A host that locks the prototype can prevent removal, but not deactivation.
      }
    };

    prototype[displayHook] = dispose;
    prototype.getRegisteredToolDefinition = lookup;
    return dispose;
  } catch {
    dispose?.();
    return undefined;
  }
}
