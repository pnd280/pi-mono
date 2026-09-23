import { writeFileSync } from "node:fs";

import { SessionManager, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export function saveActiveBranch(
  cwd: string,
  source: Pick<ExtensionCommandContext["sessionManager"], "getBranch" | "getHeader">
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

  // The header gets a fresh session ID; the source's entry IDs and parent links remain intact.
  const lines = [header, ...source.getBranch()].map((entry) => JSON.stringify(entry));
  writeFileSync(path, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });

  return path;
}
