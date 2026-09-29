import { createHash } from "node:crypto";

import type { CustomMessageEntryDraft } from "@earendil-works/pi-coding-agent";
import { absolutePathSchema, relativeDisplayPath } from "@pi-mono/utils/paths";
import { z } from "zod";

import type { Selection } from "./storage.ts";

export const noticeType = "pi-nested-instructions.notice";

export const noticeSchema = z.strictObject({
  version: z.literal(1),
  directory: absolutePathSchema.max(65536),
  path: absolutePathSchema.max(65536).nullable(),
  /** The cwd-relative path used in the model-facing preamble when the notice was created. */
  displayPath: z.string().max(65536),
  action: z.enum(["loaded", "updated", "removed"]),
  stamp: z.string().max(256).nullable(),
  fileDigest: z.string().length(64).nullable(),
  messageDigest: z.string().length(64)
});

export type Notice = z.infer<typeof noticeSchema>;

type NoticeMessage = Pick<CustomMessageEntryDraft, "content" | "details">;

/** Fingerprint for notice `fileDigest`/`messageDigest` and projection visibility checks. */
export function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function noticePreamble(displayPath: string, action: Notice["action"]): string {
  if (action === "removed")
    return `Removed nested instructions for ${displayPath}. The earlier instructions for this directory no longer apply.`;

  return `${action === "loaded" ? "Loaded" : "Updated"} nested instructions from ${displayPath}${action === "updated" ? " (supersedes the earlier instructions for this directory)" : ""}:\n\n`;
}

export function noticeEntry(
  directory: string,
  selected: Selection | undefined,
  action: Notice["action"],
  cwd: string
): CustomMessageEntryDraft {
  const displayPath = relativeDisplayPath(selected?.path ?? directory, cwd);
  const content = noticePreamble(displayPath, action) + (selected?.content ?? "");
  const details: Notice = {
    version: 1,
    directory,
    path: selected?.path ?? null,
    displayPath,
    action,
    stamp: selected?.stamp ?? null,
    fileDigest: selected?.content === undefined ? null : digest(selected.content),
    messageDigest: digest(content)
  };

  return { type: "custom_message", customType: noticeType, content, display: true, details };
}

/** Splits a notice into its details and the instruction body, without the model-facing preamble. */
export function decodeNotice(message: NoticeMessage): { notice: Notice | undefined; body: string } {
  const parsed = noticeSchema.safeParse(message.details);
  const notice = parsed.success ? parsed.data : undefined;
  const content =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
  const preamble = notice ? noticePreamble(notice.displayPath, notice.action) : "";

  return {
    notice,
    body: content.startsWith(preamble) ? content.slice(preamble.length) : content
  };
}
