import { writeFileSync } from "node:fs";

import { uuidv7 } from "@earendil-works/pi-ai";
import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function saveActiveBranch(
  cwd: string,
  source: Pick<
    ExtensionCommandContext["sessionManager"],
    "getBranch" | "getHeader" | "getSessionName"
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
  const name = source.getSessionName();
  const branchName = entries
    .filter((entry) => entry.type === "session_info")
    .at(-1)
    ?.name?.trim();

  // Pi names are session-wide, so their latest metadata can be outside the selected branch.
  // Append a snapshot only when needed, without changing the copied entries or source session.
  if (name !== (branchName || undefined)) {
    entries.push({
      type: "session_info",
      id: uuidv7(),
      parentId: entries.at(-1)?.id ?? null,
      timestamp: new Date().toISOString(),
      name: name ?? ""
    });
  }

  // The header gets a fresh session ID; the source's entry IDs and parent links remain intact.
  const lines = [header, ...entries].map((entry) => JSON.stringify(entry));
  writeFileSync(path, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });

  return path;
}
