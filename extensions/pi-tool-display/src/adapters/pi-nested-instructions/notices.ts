import { noticeSchema, noticeType } from "pi-nested-instructions/notices";

import type { SummaryNotice } from "../../contracts.ts";
import { record } from "../../values.ts";

/** A displayed nested-instruction notice. Only valid details have a summary. */
export type InstructionNotice = { summary: SummaryNotice | undefined };

/** Pure: recognise a displayed notice message; undefined for any other message. */
export function instructionNotice(message: unknown): InstructionNotice | undefined {
  const value = record(message);
  if (value.role !== "custom" || value.customType !== noticeType || value.display !== true)
    return undefined;

  return { summary: noticeSummary(value.details) };
}

/** Only validated persisted facts contribute counts; never infer actions from prose. */
function noticeSummary(details: unknown): SummaryNotice | undefined {
  const parsed = noticeSchema.safeParse(details);
  if (!parsed.success) return undefined;
  const notice = parsed.data;
  const removed = notice.action === "removed";

  return {
    category: {
      id: `pi-nested-instructions:${notice.action}`,
      count: {
        one: removed
          ? "removed instructions from {n} dir"
          : `${notice.action} {n} instruction file`,
        other: removed
          ? "removed instructions from {n} dirs"
          : `${notice.action} {n} instruction files`
      }
    },
    identity: removed ? notice.directory : (notice.path ?? notice.directory)
  };
}
