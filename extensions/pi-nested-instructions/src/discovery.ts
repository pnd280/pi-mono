import type {
  CustomMessageEntryDraft,
  SessionBoundaryDraft
} from "@earendil-works/pi-coding-agent";

import { ledger, type SessionView } from "./ledger.ts";
import { noticeEntry } from "./notices.ts";
import { inferScope, nestedPath, sortDirectories, type Invocation } from "./scopes.ts";
import type { SkillFolders } from "./skill-folders.ts";
import { listingEntry, listSkills } from "./skill-listings.ts";
import { instructionFiles, selectInstruction, type InstructionFiles } from "./storage.ts";

/**
 * Process a whole batch so a sibling direct read wins before any content is loaded. Each directory's skill listing follows its notice.
 */
export async function discover(
  calls: Invocation[],
  cwd: string,
  session: SessionView,
  skillFolders: SkillFolders,
  files: InstructionFiles = instructionFiles
): Promise<SessionBoundaryDraft[]> {
  const visible = ledger(session);
  const entries: SessionBoundaryDraft[] = [];
  const directories = new Set<string>();

  for (const call of calls) {
    try {
      const scope = await inferScope(call, cwd);
      for (const directory of scope.directories) directories.add(directory);

      for (const file of scope.reads) {
        const stamp = await files.stamp(file);
        const entry = visible.markRead(call, file, stamp);
        if (entry) entries.push(entry);
      }
    } catch {
      /* Malformed/unsupported scope inference must not affect tool execution. */
    }
  }

  for (const directory of sortDirectories(directories)) {
    if (!visible.announced(directory)) {
      // Ordinary accesses retain snapshots: any visible direct read suppresses, even if changed.
      const selected = await selectInstruction(directory, files, (file) => visible.wasRead(file));
      if (selected?.content !== undefined)
        entries.push(
          noticeEntry(
            directory,
            { action: "loaded", path: selected.path, content: selected.content },
            cwd
          )
        );
    }

    const folders = skillFolders.get(directory);
    if (!folders || visible.listing(directory)) continue;
    const listed = listSkills(folders);
    if (!listed.list) continue;
    const listing = listingEntry(directory, { action: "loaded", ...listed }, cwd);
    if (listing) entries.push(listing);
  }

  return entries;
}

/** Startup/resume/reload only. Ordinary accesses retain model-visible snapshots. */
export async function refresh(
  cwd: string,
  session: SessionView,
  skillFolders: SkillFolders,
  files: InstructionFiles = instructionFiles
): Promise<CustomMessageEntryDraft[]> {
  const visible = ledger(session);
  const entries: CustomMessageEntryDraft[] = [];

  for (const directory of sortDirectories(visible.directories())) {
    if (!nestedPath(cwd, directory)) continue;
    const selected = await selectInstruction(directory, files, (file, stamp) =>
      visible.readUnchanged(file, stamp)
    );

    const delivered = visible.delivered(directory);

    if (!selected) {
      if (delivered) entries.push(noticeEntry(directory, { action: "removed" }, cwd));
    } else if (
      selected.content !== undefined &&
      !visible.current(directory, selected.path, selected.content)
    ) {
      entries.push(
        noticeEntry(
          directory,
          {
            action: delivered ? "updated" : "loaded",
            path: selected.path,
            content: selected.content
          },
          cwd
        )
      );
    }
  }

  for (const directory of sortDirectories(visible.listedDirectories())) {
    if (!nestedPath(cwd, directory)) continue;
    const previous = visible.listing(directory) ?? "";
    const listed = listSkills(skillFolders.get(directory) ?? []);
    if (listed.list === previous) continue;
    const listing = listingEntry(
      directory,
      listed.list ? { action: previous ? "updated" : "loaded", ...listed } : { action: "removed" },
      cwd
    );
    if (listing) entries.push(listing);
  }

  return entries;
}
