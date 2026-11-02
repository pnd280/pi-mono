import { writeFileSync } from "node:fs";

import { uuidv7 } from "@earendil-works/pi-ai";
import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** Session-wide metadata, before it is linked into the saved branch. */
type Snapshot =
  | { type: "session_info"; name: string }
  | { type: "label"; targetId: string; label: string | undefined };

export function saveActiveBranch(
  cwd: string,
  source: Pick<
    ExtensionCommandContext["sessionManager"],
    "getBranch" | "getHeader" | "getLabel" | "getSessionName"
  >
): string {
  const parentSession = source.getHeader()?.parentSession;
  const destination = SessionManager.create(
    cwd,
    undefined,
    parentSession ? { parentSession } : undefined
  );
  const path = destination.getSessionFile();
  const header = destination.getHeader();
  if (!path || !header) throw new Error("Could not create a persistent Pi session");

  const entries = [...source.getBranch()];
  let branchName: string | undefined;
  const branchLabels = new Map<string, string | undefined>();

  for (const entry of entries) {
    if (entry.type === "session_info") branchName = entry.name?.trim() || undefined;
    if (entry.type === "label") branchLabels.set(entry.targetId, entry.label || undefined);
  }

  // Pi names and labels are session-wide, so their latest metadata can be outside the selected
  // branch. Append snapshots only where needed, without changing the copied entries or source.
  const snapshots: Snapshot[] = [];
  const name = source.getSessionName();
  if (name !== branchName) snapshots.push({ type: "session_info", name: name ?? "" });

  for (const { id } of entries) {
    const label = source.getLabel(id);
    if (label !== branchLabels.get(id)) snapshots.push({ type: "label", targetId: id, label });
  }

  const timestamp = new Date().toISOString();

  for (const snapshot of snapshots) {
    entries.push({ ...snapshot, id: uuidv7(), parentId: entries.at(-1)?.id ?? null, timestamp });
  }

  // The header gets a fresh session ID; the source's entry IDs and parent links remain intact.
  const lines = [header, ...entries].map((entry) => JSON.stringify(entry));
  writeFileSync(path, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });

  return path;
}
