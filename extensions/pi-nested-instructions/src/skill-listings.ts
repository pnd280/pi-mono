import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
  type CustomMessageEntryDraft
} from "@earendil-works/pi-coding-agent";
import { relativeDisplayPath } from "@pi-mono/utils/paths";
import { z } from "zod";

import { absolutePathSchema, digest, sender } from "./notices.ts";

export const listingType = "pi-nested-instructions.skills";

export const listingSchema = z.strictObject({
  version: z.literal(1),
  directory: absolutePathSchema,
  /** The cwd-relative directory used in the model-facing text when the listing was created. */
  displayPath: z.string().max(65536),
  action: z.enum(["loaded", "updated", "removed"]),
  /** The listed skills, for display. The model-facing list is the message content. */
  skills: z
    .array(z.strictObject({ name: z.string().max(1024), description: z.string().max(65536) }))
    .max(4096),
  messageDigest: z.string().length(64)
});

export type Listing = z.infer<typeof listingSchema>;

/** A directory's skills that the model may invoke; `list` is empty when there are none. */
type ListedSkills = { skills: Listing["skills"]; list: string };

/** Reads the folders with Pi's loader and renders them as Pi lists skills in its prompt. */
export function listSkills(folders: readonly string[]): ListedSkills {
  const skills = folders.flatMap((dir) => loadSkillsFromDir({ dir, source: "project" }).skills);

  return {
    skills: skills
      .filter((skill) => !skill.disableModelInvocation)
      .map(({ name, description }) => ({ name, description })),
    // No tool is named, because the model may reach files only through another tool.
    list: formatSkillsForPrompt(skills, "indirect")
  };
}

/** The model-facing text before the skill list. Like notices, it says that Pi sent the message. */
function listingPrefix(displayPath: string, action: Listing["action"]): string {
  switch (action) {
    case "loaded":
      return `Pi listed these skills automatically because a tool call used a path in ${displayPath}. ${sender}`;
    case "updated":
      return `Pi listed these skills automatically because the skills in ${displayPath} changed. This list replaces the earlier skill list for this directory. ${sender}`;
    case "removed":
      return `Pi no longer lists skills for ${displayPath}, so the earlier skill list for this directory no longer applies. ${sender}`;
  }
}

/** Loaded and updated listings carry the skill list; a removal names only the directory. */
type ListingChange = ({ action: "loaded" | "updated" } & ListedSkills) | { action: "removed" };

/** Returns nothing for a listing that the reader would reject, so it is never written. */
export function listingEntry(
  directory: string,
  change: ListingChange,
  cwd: string
): CustomMessageEntryDraft | undefined {
  const listed = change.action === "removed" ? undefined : change;
  const displayPath = relativeDisplayPath(directory, cwd);
  const content = listingPrefix(displayPath, change.action) + (listed?.list ?? "");
  const details = listingSchema.safeParse({
    version: 1,
    directory,
    displayPath,
    action: change.action,
    skills: listed?.skills ?? [],
    messageDigest: digest(content)
  });
  if (!details.success) return undefined;

  return {
    type: "custom_message",
    customType: listingType,
    content,
    display: true,
    details: details.data
  };
}

/** The skill list of a listing's message, without the model-facing text before it. */
export function listingList(content: string, listing: Listing): string {
  const prefix = listingPrefix(listing.displayPath, listing.action);

  return content.startsWith(prefix) ? content.slice(prefix.length) : content;
}
