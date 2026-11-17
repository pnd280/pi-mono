import { SessionManager } from "@earendil-works/pi-coding-agent";

import { lateUsageOf } from "./background-result.ts";
import { LATE_USAGE_KIND } from "./constants.ts";

const PATCHED = Symbol.for("pi-subagents.late-usage-patch");

type Append = SessionManager["appendCustomMessageEntry"];

/**
 * Adds a hidden usage entry after Pi persists a background result with late usage. Pi's extension API has no usage writer; see docs/adr/0002-count-late-background-usage.md. The patch is process-wide; the symbol guard prevents double counting after reload.
 */
export function installLateUsagePatch(): void {
  const proto = SessionManager.prototype as SessionManager & { [PATCHED]?: true };
  if (proto[PATCHED]) return;
  // The wrapper below calls Pi's method with the session as its receiver.
  // oxlint-disable-next-line typescript/unbound-method
  const append = proto.appendCustomMessageEntry;
  proto[PATCHED] = true;

  proto.appendCustomMessageEntry = function <T>(
    this: SessionManager,
    customType: string,
    content: Parameters<Append>[1],
    display: boolean,
    details?: T
  ): string {
    const id = append.call(this, customType, content, display, details);
    const late = lateUsageOf({ customType, details });
    if (late) this.appendUsage(LATE_USAGE_KIND, late.provider, late.model, late.usage);

    return id;
  };
}
