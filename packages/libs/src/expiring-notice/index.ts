import { z } from "zod";

const durationSchema = z.number().nonnegative().max(2_147_483_647);

export type ExpiringNoticeOptions = {
  durationMs: number;
  changed(): void;
};

/** Replaceable feedback with expiry. */
export class ExpiringNotice<Value> {
  private notice: Value | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: ExpiringNoticeOptions) {
    if (!durationSchema.safeParse(options.durationMs).success)
      throw new RangeError("Notice duration must be a supported nonnegative timer duration.");
  }

  get value(): Value | undefined {
    return this.notice;
  }

  set(value: Value): void {
    if (this.disposed) return;
    this.clear();
    this.notice = value;
    this.expiry = setTimeout(() => {
      this.clear();
      this.options.changed();
    }, this.options.durationMs);
    this.options.changed();
  }

  clear(): void {
    clearTimeout(this.expiry);
    this.expiry = undefined;
    this.notice = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}
