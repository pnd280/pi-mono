import type {
  CustomMessageEntryDraft,
  SessionBoundaryDraft
} from "@earendil-works/pi-coding-agent";

import { ledger, type SessionView } from "./ledger.ts";
import { noticeEntry } from "./notices.ts";
import { inferScope, nestedPath, sortDirectories, type Invocation } from "./scopes.ts";
import { instructionFiles, selectInstruction, type InstructionFiles } from "./storage.ts";

/** Process a whole batch so a sibling direct read wins before any content is loaded. */
export async function discover(
  calls: Invocation[],
  cwd: string,
  session: SessionView,
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
        const stamp = await files.stamp(file).catch(() => undefined);
        const entry = visible.markRead(call.toolCallId, file, stamp);
        if (entry) entries.push(entry);
      }
    } catch {
      /* Malformed/unsupported scope inference must not affect tool execution. */
    }
  }

  for (const directory of sortDirectories(directories)) {
    if (visible.announced(directory)) continue;
    // Ordinary accesses retain snapshots: any visible direct read suppresses, even if changed.
    const selected = await selectInstruction(directory, files, (file) => visible.wasRead(file));
    if (selected?.content !== undefined)
      entries.push(noticeEntry(directory, selected, "loaded", cwd));
  }

  return entries;
}

/** Startup/resume/reload only. Ordinary accesses retain model-visible snapshots. */
export async function refresh(
  cwd: string,
  session: SessionView,
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
      if (delivered) entries.push(noticeEntry(directory, undefined, "removed", cwd));
    } else if (
      selected.content !== undefined &&
      !visible.current(directory, selected.path, selected.content)
    ) {
      entries.push(noticeEntry(directory, selected, delivered ? "updated" : "loaded", cwd));
    }
  }

  return entries;
}
