import { z } from "zod";

const durationSchema = z.number().nonnegative().max(2_147_483_647);

export type ExpiringNoticeOptions<Value> = {
  durationMs: number;
  changed(): void;
  report(value: Value): void;
};

/** Replaceable feedback with expiry and deferred, at-most-once overflow reporting. */
export class ExpiringNotice<Value> {
  private notice: { value: Value; reported: boolean } | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: ExpiringNoticeOptions<Value>) {
    if (!durationSchema.safeParse(options.durationMs).success)
      throw new RangeError("Notice duration must be a supported nonnegative timer duration.");
  }

  get value(): Value | undefined {
    return this.notice?.value;
  }

  set(value: Value): void {
    if (this.disposed) return;
    this.clear();
    this.notice = { value, reported: false };
    this.expiry = setTimeout(() => {
      this.clear();
      this.options.changed();
    }, this.options.durationMs);
    this.options.changed();
  }

  reportOnce(): void {
    const notice = this.notice;
    if (!notice || notice.reported || this.disposed) return;
    notice.reported = true;
    // Notifications may change a component tree. Do not deliver them during render.
    queueMicrotask(() => {
      if (!this.disposed && this.notice === notice) this.options.report(notice.value);
    });
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
