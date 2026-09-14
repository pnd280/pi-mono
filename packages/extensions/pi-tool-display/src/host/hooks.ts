/** Restore only this installation's methods; later wrappers retain ownership. */
export class OwnedHooks {
  private restorations: (() => void)[] = [];
  replace<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
    const previous = target[key];
    target[key] = value;
    this.restorations.push(() => {
      if (target[key] === value) target[key] = previous;
    });
  }
  restore(): void {
    for (const restore of this.restorations.splice(0).reverse()) {
      try {
        restore();
      } catch {
        /* A locked host can prevent removal, not deactivation. */
      }
    }
  }
}
