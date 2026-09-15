import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const manifestSchema = z.object({ bin: z.object({ pi: z.string().min(1) }) });

export type PiLaunch = {
  command: string;
  args: string[];
  options: { cwd: string; env: NodeJS.ProcessEnv };
};

/** Creates only the private directory skeleton; consumers own fixtures and cleanup. */
export async function createValidationWorkspace(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  for (const name of ["work", "home", "agent", "tmp"])
    await mkdir(join(directory, name), { mode: 0o700 });

  return directory;
}

/** Resolve and validate the executable declared by the installed Pi package. */
export async function resolvePiExecutable(): Promise<string> {
  const packageDirectory = dirname(
    dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")))
  );
  const manifest: unknown = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8")
  );
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) throw new Error("Installed Pi package has no bin.pi executable.");

  return join(packageDirectory, parsed.data.bin.pi);
}

/** Prepare an offline launch without starting it or inheriting user credentials/settings. */
export async function createPiLaunch(options: {
  directory: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<PiLaunch> {
  const { directory } = options;

  return {
    command: process.execPath,
    args: [await resolvePiExecutable(), ...options.args],
    options: {
      cwd: join(directory, "work"),
      env: {
        PATH: process.env.PATH,
        TERM: process.env.TERM ?? "xterm-256color",
        COLORTERM: process.env.COLORTERM,
        LANG: process.env.LANG ?? "en_US.UTF-8",
        ...options.env,
        // Keep storage and offline isolation authoritative even with helper overrides.
        HOME: join(directory, "home"),
        USERPROFILE: join(directory, "home"),
        TMPDIR: join(directory, "tmp"),
        TMP: join(directory, "tmp"),
        TEMP: join(directory, "tmp"),
        PI_CODING_AGENT_DIR: join(directory, "agent"),
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0"
      }
    }
  };
}
