import { SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";

type ReadonlySessionManager = ExtensionContext["sessionManager"];

/** Input eligibility uses the actual leaf, including metadata; never walk backwards. */
export function extensionInputEligible(manager: ReadonlySessionManager): boolean {
  return manager.getLeafEntry()?.type === "custom_message";
}

/**
 * Pi 0.85.1 passes the actual SessionManager through its read-only context type.
 * Both bundled and API fixtures verify this synchronous append contract. No event
 * hook covers all custom appends, so this is the only allowlisted capture path.
 */
export function installCustomAppend(options: {
  manager: ReadonlySessionManager;
  allowlist: string[];
  capture(text: string, recordedAt: string): void;
  now(): Date;
}): (() => void) | undefined {
  const manager = options.manager;

  if (!(manager instanceof SessionManager)) return undefined;
  // Retain the unbound original so the wrapper preserves the caller's receiver.
  // oxlint-disable-next-line typescript/unbound-method
  const original = manager.appendCustomMessageEntry;
  const source = Function.prototype.toString.call(original);

  if (
    original.length !== 4 ||
    !source.includes('"custom_message"') ||
    !source.includes("_appendEntry") ||
    !/\breturn\b[\s\S]*\b\w+\.id\s*;?\s*}$/.test(source)
  )
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(manager, "appendCustomMessageEntry");
  let active = true;
  const allowlist = new Set(options.allowlist);

  const wrapper: SessionManager["appendCustomMessageEntry"] = function (
    this: SessionManager,
    ...args
  ) {
    let recordedAt: string | undefined;

    try {
      if (active) recordedAt = options.now().toISOString();
    } catch {
      /* Observation clock failures may not prevent the original append. */
    }

    const result = original.apply(this, args);

    if (active && this === manager && recordedAt !== undefined) {
      try {
        const entry = manager.getEntry(result);

        if (entry?.type === "custom_message" && allowlist.has(entry.customType)) {
          const text =
            typeof entry.content === "string"
              ? entry.content
              : entry.content
                  .filter((block) => block.type === "text")
                  .map((block) => block.text)
                  .join("\n");
          options.capture(text, recordedAt);
        }
      } catch {
        // Feature observation must never change the original append's behavior.
      }
    }

    return result;
  };

  try {
    manager.appendCustomMessageEntry = wrapper;
  } catch {
    return undefined;
  }

  return () => {
    active = false;
    if (manager.appendCustomMessageEntry !== wrapper) return;
    if (descriptor) Object.defineProperty(manager, "appendCustomMessageEntry", descriptor);
    else Reflect.deleteProperty(manager, "appendCustomMessageEntry");
  };
}
