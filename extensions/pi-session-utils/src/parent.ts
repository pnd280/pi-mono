import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { CURRENT_SESSION_VERSION, getAgentDir } from "@earendil-works/pi-coding-agent";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

const headerSchema = z.object({
  type: z.literal("session"),
  id: z.string().min(1),
  cwd: z.string().min(1),
  timestamp: z.string().min(1),
  version: z.number().int().min(1).max(CURRENT_SESSION_VERSION).optional()
});
const MAX_HEADER_BYTES = 1024 * 1024;

// Read only the header: opening a parent with SessionManager.open() can migrate its file.
function readParentHeader(path: string): z.infer<typeof headerSchema> {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);

  try {
    if (!fstatSync(fd).isFile()) throw new Error("Parent must be a regular session file");
    const chunks: Buffer[] = [];
    let length = 0;
    let ended = false;

    while (length < MAX_HEADER_BYTES) {
      const buffer = Buffer.alloc(Math.min(4096, MAX_HEADER_BYTES - length));
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      const newline = buffer.subarray(0, count).indexOf(10);
      chunks.push(buffer.subarray(0, newline === -1 ? count : newline));
      length += count;

      if (newline !== -1) {
        ended = true;
        break;
      }
    }

    if (!ended && length === MAX_HEADER_BYTES && readSync(fd, Buffer.alloc(1), 0, 1, null)) {
      throw new Error("Parent session header exceeds 1 MiB");
    }

    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    return headerSchema.parse(value);
  } finally {
    closeSync(fd);
  }
}

function expandPath(path: string, cwd: string): string {
  return resolve(cwd, expandHomePath(path, homedir()));
}

function sessionFiles(directory: string): string[] {
  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => join(directory, name));
  } catch {
    return [];
  }
}

function defaultDirectories(): string[] {
  const root = join(getAgentDir(), "sessions");

  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

export function resolveParentSession(reference: string, cwd: string, sessionDir?: string): string {
  const path = expandPath(reference, cwd);
  const isPath = isAbsolute(reference) || /[/\\]/.test(reference) || existsSync(path);

  if (isPath) {
    try {
      readParentHeader(path);

      return realpathSync(path);
    } catch {
      throw new Error("--parent-session requires an existing, readable Pi session file");
    }
  }

  const directories = new Set(defaultDirectories());
  if (sessionDir) directories.add(expandPath(sessionDir, cwd));
  const matches = new Set<string>();

  for (const directory of directories) {
    for (const candidate of sessionFiles(directory)) {
      try {
        if (readParentHeader(candidate).id === reference) matches.add(realpathSync(candidate));
      } catch {
        // Discovery skips unreadable/non-session files, like Pi's session picker.
      }
    }
  }

  if (matches.size > 1) throw new Error("Ambiguous parent session ID; use a file path");
  const [match] = matches;
  if (!match) throw new Error("Parent session ID not found; use an exact ID or file path");

  return match;
}
