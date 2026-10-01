import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

// Pi's native context-file order. Do not use loadProjectContextFiles here: it
// also reads cwd/ancestors and would reread files covered by direct-read markers.
export const instructionNames: readonly string[] = [
  "AGENTS.override.md",
  "AGENTS.md",
  "AGENTS.MD",
  "CLAUDE.md",
  "CLAUDE.MD"
];

export interface InstructionFiles {
  stamp(this: void, file: string): Promise<string | undefined>;
  read(this: void, file: string): Promise<string>;
}

export const instructionFiles: InstructionFiles = {
  async stamp(file) {
    try {
      const info = await stat(file);
      if (!info.isFile()) return undefined;
      await access(file, constants.R_OK);

      return [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(":");
    } catch {
      return undefined;
    }
  },
  async read(file) {
    return (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
  }
};

export interface Selection {
  path: string;
  content?: string;
}

export async function selectInstruction(
  directory: string,
  files: InstructionFiles,
  suppress: (file: string, stamp: string) => boolean
): Promise<Selection | undefined> {
  for (const name of instructionNames) {
    const file = path.join(directory, name);

    try {
      const stamp = await files.stamp(file);
      if (stamp === undefined) continue;
      if (suppress(file, stamp)) return { path: file };

      return { path: file, content: await files.read(file) };
    } catch {
      /* Pi falls back to the next readable regular file. */
    }
  }

  return undefined;
}
