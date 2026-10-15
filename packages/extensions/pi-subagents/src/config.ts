import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  readScopedSettings,
  readSettingsFile,
  readSettingsRecord
} from "@pi-mono/libs/settings-file";
import { expandHomePath } from "@pi-mono/utils/paths";
import { z } from "zod";

const sectionSchema = z.object({
  maxDepth: z.int().nonnegative().optional().catch(undefined),
  maxConcurrent: z.int().positive().optional().catch(undefined),
  maxQueued: z.int().nonnegative().optional().catch(undefined),
  jobs: z.boolean().optional().catch(undefined),
  docs: z.unknown().optional()
});
const docsSchema = z.array(z.string().trim().min(1));

export type SubagentsConfig = {
  maxDepth: number;
  maxConcurrent: number;
  maxQueued: number;
  /** Registers the `job` and `job_abort` tools. */
  jobs: boolean;
};

type ScopeSettings = Omit<z.output<typeof sectionSchema>, "docs"> & {
  /** Absolute paths; absent when the scope sets no valid list. */
  docPaths?: string[];
  warnings: string[];
};

function readSection(path: string): ScopeSettings {
  let section: unknown;

  try {
    section = readSettingsRecord(path)["ext.pi-subagents"];
  } catch {
    return { warnings: [] };
  }

  const { docs, ...limits } = sectionSchema.safeParse(section).data ?? {};
  if (docs === undefined) return { ...limits, warnings: [] };
  const paths = docsSchema.safeParse(docs);

  if (!paths.success)
    return {
      ...limits,
      warnings: [`ext.pi-subagents.docs in ${path} is invalid; expected an array of file paths`]
    };

  return {
    ...limits,
    // Relative paths belong to the scope that names them.
    docPaths: paths.data.map((entry) => resolve(dirname(path), expandHomePath(entry, homedir()))),
    warnings: []
  };
}

/**
 * Valid trusted-project values override global values. A project `docs` list replaces the
 * global list; `docs` joins the readable files for the `subagent` description.
 */
export function loadConfig(
  cwd: string,
  { projectTrusted = false, agentDir }: { projectTrusted?: boolean; agentDir?: string } = {}
): SubagentsConfig & { docs: string; warnings: string[] } {
  const [global, project = { warnings: [] }] = readScopedSettings(
    { cwd, projectTrusted, agentDir },
    readSection
  );
  const warnings = [...global.warnings, ...project.warnings];
  const docs: string[] = [];

  for (const path of project.docPaths ?? global.docPaths ?? []) {
    let text: string | undefined;

    try {
      text = readSettingsFile(path);
    } catch {
      // Reported below without the file contents.
    }

    if (text === undefined) warnings.push(`${path} could not be read; its docs are left out`);
    else if (text.trim()) docs.push(text.trim());
  }

  return {
    maxDepth: project.maxDepth ?? global.maxDepth ?? 2,
    maxConcurrent: project.maxConcurrent ?? global.maxConcurrent ?? 8,
    maxQueued: project.maxQueued ?? global.maxQueued ?? 8,
    jobs: project.jobs ?? global.jobs ?? false,
    docs: docs.join("\n\n"),
    warnings
  };
}
