import { createHash } from "node:crypto";
import path from "node:path";

import type { CustomMessageEntryDraft } from "@earendil-works/pi-coding-agent";
import { absolutePathSchema, relativeDisplayPath } from "@pi-mono/utils/paths";
import { z } from "zod";

import type { Selection } from "./storage.ts";

export const noticeType = "pi-nested-instructions.notice";

export const noticeSchema = z.strictObject({
  version: z.literal(3),
  directory: absolutePathSchema.max(65536),
  path: absolutePathSchema.max(65536).nullable(),
  /** The cwd-relative path used in the model-facing text when the notice was created. */
  displayPath: z.string().max(65536),
  action: z.enum(["loaded", "updated", "removed"]),
  messageDigest: z.string().length(64)
});

export type Notice = z.infer<typeof noticeSchema>;

type NoticeMessage = Pick<CustomMessageEntryDraft, "content" | "details">;

/** Fingerprint for projected notice messages and originating tool calls. */
export function digest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const sender = "The user did not send this message.";

/**
 * The model-facing text around the instruction body. Notices reach the model as user messages,
 * and compaction labels them as user text, so the text says that Pi sent them. The tag matches
 * Pi's native project context.
 */
function noticeFrame(
  displayPath: string,
  action: Notice["action"]
): { prefix: string; suffix: string } {
  if (action === "removed")
    return {
      prefix: `Pi found no instruction file in ${displayPath}, so the earlier instructions for this directory no longer apply. ${sender}`,
      suffix: ""
    };
  // Display paths always use forward slashes.
  const directory = path.posix.dirname(displayPath);
  const reason =
    action === "loaded"
      ? `Pi loaded this file automatically because a tool call used a path in ${directory}.`
      : `Pi loaded this file automatically because the instruction files in ${directory} changed. This file replaces the earlier instructions for this directory.`;

  return {
    prefix: `${reason} ${sender}\n\n<project_instructions path="${displayPath}">\n`,
    suffix: "\n</project_instructions>"
  };
}

export function noticeEntry(
  directory: string,
  selected: Selection | undefined,
  action: Notice["action"],
  cwd: string
): CustomMessageEntryDraft {
  const displayPath = relativeDisplayPath(selected?.path ?? directory, cwd);
  const { prefix, suffix } = noticeFrame(displayPath, action);
  const content = prefix + (selected?.content ?? "") + suffix;
  const details: Notice = {
    version: 3,
    directory,
    path: selected?.path ?? null,
    displayPath,
    action,
    messageDigest: digest(content)
  };

  return { type: "custom_message", customType: noticeType, content, display: true, details };
}

/** Splits a notice into its details and the instruction body, without the model-facing text around it. */
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
  const { prefix, suffix } = notice
    ? noticeFrame(notice.displayPath, notice.action)
    : { prefix: "", suffix: "" };
  const framed =
    content.length >= prefix.length + suffix.length &&
    content.startsWith(prefix) &&
    content.endsWith(suffix);

  return {
    notice,
    body: framed ? content.slice(prefix.length, content.length - suffix.length) : content
  };
}
