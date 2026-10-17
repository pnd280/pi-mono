const provenanceKey = Symbol.for("@pi-mono/libs/owned-hooks.provenance");

// Pi reloads extensions with jiti's moduleCache disabled. Share only weak function
// keys across module instances; do not retain targets, owners, or sessions here.
const registry = globalThis as typeof globalThis & {
  [provenanceKey]?: WeakMap<object, unknown>;
};
const predecessors = (registry[provenanceKey] ??= new WeakMap<object, unknown>());

/** Follow recorded replacements, including wrappers retained after restore(). */
export function unwrapHook(value: unknown): unknown {
  const seen = new Set<unknown>();

  while (typeof value === "function" && predecessors.has(value)) {
    if (seen.has(value)) return undefined;
    seen.add(value);
    value = predecessors.get(value);
  }

  return value;
}

/** Owns property replacements, not the behavior or lifetime of retained callbacks. */
export class OwnedHooks {
  private restorations: (() => void)[] = [];

  replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    if (previous && (!("value" in previous) || !previous.writable))
      throw new TypeError("Owned hooks require writable data properties.");

    let descriptor = previous;

    if (typeof value === "function") {
      let owner: object | null = target;

      while (!descriptor && owner) {
        const parent: unknown = Object.getPrototypeOf(owner);
        owner = typeof parent === "object" ? parent : null;
        if (owner) descriptor = Object.getOwnPropertyDescriptor(owner, key);
      }
    }

    const predecessor: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;

    // Define an own data property without invoking an inherited setter. Preserve existing
    // flags, and remove newly introduced shadows rather than freezing a prototype's value.
    Object.defineProperty(target, key, {
      ...(previous ?? { configurable: true, enumerable: true, writable: true }),
      value
    });

    if (typeof value === "function" && value !== predecessor) {
      // A reused function cannot claim two different predecessors. Leave an
      // ambiguous link unresolved rather than overwrite its original provenance.
      if (predecessors.has(value) && predecessors.get(value) !== predecessor)
        predecessors.set(value, undefined);
      else predecessors.set(value, predecessor);
    }

    this.restorations.push(() => {
      const current = Object.getOwnPropertyDescriptor(target, key);
      if (!current || !("value" in current) || current.value !== value) return;
      if (previous) Object.defineProperty(target, key, previous);
      else Reflect.deleteProperty(target, key);
    });
  }

  restore(): void {
    for (const restore of this.restorations.splice(0).reverse()) {
      try {
        restore();
      } catch {
        // A subsequently locked property must not prevent restoring other owned hooks.
        // Consumers must deactivate their callbacks before attempting restoration.
      }
    }
  }
}
