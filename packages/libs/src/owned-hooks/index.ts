/** Owns property replacements, not the behavior or lifetime of retained callbacks. */
export class OwnedHooks {
  private restorations: (() => void)[] = [];

  replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    if (previous && (!("value" in previous) || !previous.writable))
      throw new TypeError("Owned hooks require writable data properties.");

    // Define an own data property without invoking an inherited setter. Preserve existing
    // flags, and remove newly introduced shadows rather than freezing a prototype's value.
    Object.defineProperty(target, key, {
      ...(previous ?? { configurable: true, enumerable: true, writable: true }),
      value
    });
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
