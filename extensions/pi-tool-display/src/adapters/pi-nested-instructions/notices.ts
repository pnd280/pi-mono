import { noticeSchema, noticeType } from "pi-nested-instructions/notices";
import { listingSchema, listingType } from "pi-nested-instructions/skill-listings";

import type { SummaryNotice } from "../../contracts.ts";
import { record } from "../../values.ts";

/** An instruction notice or a skill listing. Only valid details have a summary. */
export type NestedMessage = { summary: SummaryNotice | undefined };

/** Pure: recognise a notice or listing message; undefined for any other message. */
export function nestedMessage(message: unknown): NestedMessage | undefined {
  const value = record(message);
  if (value.role !== "custom") return undefined;
  if (value.customType === noticeType) return { summary: noticeSummary(value.details) };
  if (value.customType === listingType) return { summary: listingSummary(value.details) };

  return undefined;
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

const listingCounts = {
  loaded: "listed skills in {n}",
  updated: "updated skills in {n}",
  removed: "removed skills from {n}"
};

/** Listings count directories, separately from instruction files. */
function listingSummary(details: unknown): SummaryNotice | undefined {
  const parsed = listingSchema.safeParse(details);
  if (!parsed.success) return undefined;
  const listing = parsed.data;
  const count = listingCounts[listing.action];

  return {
    category: {
      id: `pi-nested-instructions:skills-${listing.action}`,
      count: { one: `${count} dir`, other: `${count} dirs` }
    },
    identity: listing.directory
  };
}
