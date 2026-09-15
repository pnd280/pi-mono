import { z } from "zod";

const durationSchema = z.number().nonnegative().max(2_147_483_647);

export type TimedConfirmationOptions = {
  durationMs: number;
  now(): number;
  expired(): void;
};

/** Requires the identical target twice before the deadline. Callers cancel on context changes. */
export class TimedConfirmation<Target> {
  private state: { target: Target; deadline: number } | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: TimedConfirmationOptions) {
    if (!durationSchema.safeParse(options.durationMs).success)
      throw new RangeError("Confirmation duration must be a supported nonnegative timer duration.");
  }

  get armed(): Readonly<{ target: Target; deadline: number }> | undefined {
    return this.state;
  }

  confirm(target: Target): boolean {
    if (this.disposed) return false;
    const confirmed =
      this.state !== undefined &&
      this.state.target === target &&
      this.options.now() < this.state.deadline;
    this.cancel();
    if (confirmed) return true;
    this.state = { target, deadline: this.options.now() + this.options.durationMs };
    this.expiry = setTimeout(() => {
      this.cancel();
      this.options.expired();
    }, this.options.durationMs);

    return false;
  }

  cancel(): void {
    clearTimeout(this.expiry);
    this.expiry = undefined;
    this.state = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
